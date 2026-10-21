import { MigrationInterface, QueryRunner } from 'typeorm';

// Follow-up to SplitCrossTenantMisDoctors: that migration only re-keyed the
// doctors that were actually shared, so most MIS-created users still carry
// the legacy global logins `doctor.<externalId>@mis-import.local` /
// `patient.<externalId>@mis-import.local` (or `patient.<first 8 of
// patients.id>@…` from the user-for-existing-patient path). They are
// functionally fine — lookups go through external_identities — but the Users
// page now shows two formats side by side. Rewrite every legacy login to the
// scoped format mis-identity.ts produces:
//   <kind>.<connector>.<externalId>.<tenantId>@mis-import.local
// Only users whose doctor/patient has exactly one MIS mapping are touched
// (after the split that is all of them; the guard keeps the statement safe
// if run against an older snapshot), and only when the email is exactly the
// legacy synthetic for that mapping — real addresses never match.
// patients.email mirrors the synthetic login at creation, so it is updated in
// the same pass.
export class RenameLegacyMisImportLogins1700000022000 implements MigrationInterface {
  name = 'RenameLegacyMisImportLogins1700000022000';

  public async up(q: QueryRunner): Promise<void> {
    const doctors: Array<{ id: string }> = await q.query(
      `UPDATE users u
          SET email = 'doctor.' || m.external_system || '.' || m.external_id || '.' || m.tenant_id || '@mis-import.local',
              updated_at = now()
         FROM (
           SELECT d.user_id, e.external_system, e.external_id, e.tenant_id
             FROM doctors d
             JOIN external_identities e ON e.entity_type = 'DOCTOR' AND e.internal_id = d.id
            WHERE d.id IN (SELECT internal_id FROM external_identities
                            WHERE entity_type = 'DOCTOR'
                            GROUP BY internal_id HAVING count(*) = 1)
         ) m
        WHERE u.id = m.user_id
          AND u.email = 'doctor.' || m.external_id || '@mis-import.local'
          AND NOT EXISTS (
            SELECT 1 FROM users x
             WHERE x.email = 'doctor.' || m.external_system || '.' || m.external_id || '.' || m.tenant_id || '@mis-import.local')
        RETURNING u.id`,
    );

    const patients: Array<{ id: string }> = await q.query(
      `WITH renamed AS (
         UPDATE users u
            SET email = 'patient.' || m.external_system || '.' || m.external_id || '.' || m.tenant_id || '@mis-import.local',
                updated_at = now()
           FROM (
             SELECT p.user_id, p.id AS patient_id, e.external_system, e.external_id, e.tenant_id
               FROM patients p
               JOIN external_identities e ON e.entity_type = 'PATIENT' AND e.internal_id = p.id
              WHERE p.user_id IS NOT NULL
                AND p.id IN (SELECT internal_id FROM external_identities
                              WHERE entity_type = 'PATIENT'
                              GROUP BY internal_id HAVING count(*) = 1)
           ) m
          WHERE u.id = m.user_id
            AND (u.email = 'patient.' || m.external_id || '@mis-import.local'
                 OR u.email = 'patient.' || left(m.patient_id::text, 8) || '@mis-import.local')
            AND NOT EXISTS (
              SELECT 1 FROM users x
               WHERE x.email = 'patient.' || m.external_system || '.' || m.external_id || '.' || m.tenant_id || '@mis-import.local')
          RETURNING u.id, u.email AS new_email
       )
       UPDATE patients p
          SET email = renamed.new_email, updated_at = now()
         FROM renamed
        WHERE p.user_id = renamed.id
          AND p.email LIKE 'patient.%@mis-import.local'
          AND p.email NOT LIKE 'patient.%.%.%@mis-import.local'
        RETURNING p.id`,
    );

    console.log(
      `[RenameLegacyMisImportLogins] renamed ${doctors.length} doctor logins, ${patients.length} patient rows`,
    );
  }

  public async down(): Promise<void> {
    // Cosmetic rename; the legacy format is not something to go back to.
  }
}
