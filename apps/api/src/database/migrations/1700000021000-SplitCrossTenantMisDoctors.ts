import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

// The MIS webhook used to create doctors under the global login
// `doctor.<externalId>@mis-import.local`. DocDream numbers doctors per
// installation, so two clinics whose MIS both had a doctor 105 ended up
// sharing ONE users row and ONE doctors row: every webhook from either
// clinic renamed it, and each clinic saw the other's doctor name on its own
// consultations (reprolife reported "Юлія Тараненко" on appointments that
// belong to its "Людмила Мельник").
//
// This splits every doctor that `external_identities` maps from more than
// one tenant. The tenant that mapped it first keeps the existing rows; each
// later tenant gets a fresh user + doctor pair, and everything that tenant
// owns is re-pointed at the pair:
//   - doctor_id on the tenant-owned booking/feedback/payment/prescription
//     tables plus doctor_tenant_profiles / external_identities,
//   - user_id on memberships, invites, notifications, consents and the
//     participants of that tenant's appointments.
// Names come back from each tenant's doctor_tenant_profiles.display_name,
// which was written once at profile creation and never overwritten by later
// webhooks. Specialisations cannot be recovered and self-heal on the next
// webhook (the handler rewrites them every time). Refresh sessions of the
// shared user are revoked so no live token keeps acting as the wrong doctor.
//
// The code fix (mis-identity.ts) scopes new synthetic logins by tenant and
// connector, so this cannot recur for rows created after it ships.
export class SplitCrossTenantMisDoctors1700000021000 implements MigrationInterface {
  name = 'SplitCrossTenantMisDoctors1700000021000';

  public async up(q: QueryRunner): Promise<void> {
    const rows: Array<{
      doctor_id: string;
      tenant_id: string;
      external_system: string;
      external_id: string;
    }> = await q.query(
      `SELECT e.internal_id AS doctor_id, e.tenant_id, e.external_system, e.external_id
         FROM external_identities e
        WHERE e.entity_type = 'DOCTOR'
          AND e.internal_id IN (
            SELECT internal_id FROM external_identities
             WHERE entity_type = 'DOCTOR'
             GROUP BY internal_id
            HAVING count(DISTINCT tenant_id) > 1)
        ORDER BY e.internal_id, e.created_at ASC, e.tenant_id`,
    );

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = groups.get(r.doctor_id) ?? [];
      list.push(r);
      groups.set(r.doctor_id, list);
    }

    for (const [doctorId, mappings] of groups) {
      const [keeper, ...others] = mappings;
      const [doctor]: Array<{ user_id: string; first_name: string; last_name: string }> =
        await q.query(`SELECT user_id, first_name, last_name FROM doctors WHERE id = $1`, [
          doctorId,
        ]);
      if (!doctor) continue;

      // The keeper's row currently carries whichever clinic's webhook came
      // last — put its own name back.
      const keeperName = await this.profileName(q, keeper.tenant_id, doctorId);
      if (keeperName) {
        await q.query(
          `UPDATE doctors SET first_name = $2, last_name = $3, updated_at = now() WHERE id = $1`,
          [doctorId, keeperName.first, keeperName.last],
        );
        await q.query(
          `UPDATE users SET first_name = $2, last_name = $3, updated_at = now() WHERE id = $1`,
          [doctor.user_id, keeperName.first, keeperName.last],
        );
      }

      for (const m of others) {
        const name = (await this.profileName(q, m.tenant_id, doctorId)) ?? {
          first: doctor.first_name,
          last: doctor.last_name,
        };
        const newUserId = randomUUID();
        const newDoctorId = randomUUID();
        const email = `doctor.${m.external_system}.${m.external_id}.${m.tenant_id}@mis-import.local`;

        await q.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, status)
           SELECT $1, $2, u.password_hash, $3, $4, u.status FROM users u WHERE u.id = $5`,
          [newUserId, email, name.first, name.last, doctor.user_id],
        );

        // Clone the doctor row column-for-column so the copy survives schema
        // additions, then re-key it.
        await q.query(`DROP TABLE IF EXISTS tmp_split_doctor`);
        await q.query(`CREATE TEMP TABLE tmp_split_doctor AS SELECT * FROM doctors WHERE id = $1`, [
          doctorId,
        ]);
        await q.query(
          `UPDATE tmp_split_doctor
              SET id = $1, user_id = $2, first_name = $3, last_name = $4,
                  created_at = now(), updated_at = now()`,
          [newDoctorId, newUserId, name.first, name.last],
        );
        await q.query(`INSERT INTO doctors SELECT * FROM tmp_split_doctor`);
        await q.query(`DROP TABLE tmp_split_doctor`);

        await q.query(
          `UPDATE external_identities SET internal_id = $1
            WHERE entity_type = 'DOCTOR' AND internal_id = $2 AND tenant_id = $3`,
          [newDoctorId, doctorId, m.tenant_id],
        );
        for (const table of DOCTOR_TENANT_TABLES) {
          await q.query(
            `UPDATE ${table} SET doctor_id = $1 WHERE doctor_id = $2 AND tenant_id = $3`,
            [newDoctorId, doctorId, m.tenant_id],
          );
        }
        await q.query(
          `UPDATE medical_documents SET author_doctor_id = $1
            WHERE author_doctor_id = $2 AND tenant_id = $3`,
          [newDoctorId, doctorId, m.tenant_id],
        );

        for (const table of USER_TENANT_TABLES) {
          await q.query(`UPDATE ${table} SET user_id = $1 WHERE user_id = $2 AND tenant_id = $3`, [
            newUserId,
            doctor.user_id,
            m.tenant_id,
          ]);
        }
        await q.query(
          `UPDATE appointment_participants p SET user_id = $1
             FROM appointments a
            WHERE a.id = p.appointment_id AND a.tenant_id = $3 AND p.user_id = $2`,
          [newUserId, doctor.user_id, m.tenant_id],
        );
      }

      await q.query(
        `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [doctor.user_id],
      );
      console.log(
        `[SplitCrossTenantMisDoctors] doctor ${doctorId} (ext ${keeper.external_id}) kept by tenant ${keeper.tenant_id}, split for ${others.map((o) => o.tenant_id).join(', ')}`,
      );
    }
  }

  public async down(): Promise<void> {
    // Data repair — the merged state was the bug; nothing to restore.
  }

  private async profileName(
    q: QueryRunner,
    tenantId: string,
    doctorId: string,
  ): Promise<{ first: string; last: string } | null> {
    const [row]: Array<{ display_name: string | null }> = await q.query(
      `SELECT display_name FROM doctor_tenant_profiles WHERE tenant_id = $1 AND doctor_id = $2`,
      [tenantId, doctorId],
    );
    const display = row?.display_name?.trim();
    if (!display) return null;
    const [first, ...rest] = display.split(/\s+/);
    return { first, last: rest.join(' ') || first };
  }
}

// Tenant-owned tables that point at doctors.doctor_id.
const DOCTOR_TENANT_TABLES = [
  'doctor_tenant_profiles',
  'appointments',
  'slots',
  'availability_rules',
  'service_types',
  'appointment_feedbacks',
  'payouts',
  'prescriptions',
  'referrals',
  'revenue_share_rules',
];

// Tenant-owned tables that point at users.id for the doctor's login.
const USER_TENANT_TABLES = [
  'user_tenant_memberships',
  'consultation_invites',
  'notifications',
  'consents',
];
