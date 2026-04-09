import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import dataSource from '../../config/typeorm.config';
import { hashPassword } from '../../common/crypto/password.util';

loadEnv({ path: join(process.cwd(), '..', '..', '.env') });
loadEnv({ path: join(process.cwd(), '.env'), override: false });

// Deterministic RFC-4122 v4 UUIDs (third block starts with 4, fourth with 8)
// — they survive @IsUUID() validation but stay readable in logs / SQL traces.
const PLATFORM_TENANT_ID =
  process.env.PLATFORM_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';
const CLINIC_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const DEMO_PASSWORD = 'demo1234';

async function seed(ds: DataSource): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await ds.transaction(async (em) => {
    // ---------- billing plan ----------
    const billingPlanId = '33333333-3333-4333-8333-333333333333';
    await em.query(
      `INSERT INTO tenant_billing_plans (id, name, monthly_fee, per_consultation_fee, included_modules, revenue_share_pct)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [billingPlanId, 'Pilot', 0, 50, ['booking', 'consultation', 'documents'], 15],
    );

    // ---------- tenants ----------
    const platformFeatures = JSON.stringify({
      b2cListing: true,
      bookingWidget: true,
      embeddedConsultation: true,
      prescriptionModule: true,
      analyticsPackage: true,
      brandedPatientPortal: false,
      misSync: false,
      advancedReports: true,
      audioArchive: false,
      apiAccess: true,
    });
    const clinicFeatures = JSON.stringify({
      b2cListing: false,
      bookingWidget: true,
      embeddedConsultation: true,
      prescriptionModule: true,
      analyticsPackage: true,
      brandedPatientPortal: true,
      misSync: true,
      advancedReports: true,
      audioArchive: true,
      apiAccess: false,
    });
    const audioPolicy = JSON.stringify({ enabled: true, retentionDays: 30, consentRequired: true });

    await em.query(
      `INSERT INTO tenants (id, slug, subdomain, brand_name, primary_color, locale, currency, feature_matrix, audio_policy, billing_plan_id, is_platform)
       VALUES
         ($1, 'platform', 'app', 'Telemed Platform', '#1f7ae0', 'uk', 'UAH', $2::jsonb, $3::jsonb, $4, true),
         ($5, 'clinic-a', 'clinic-a', 'Demo Clinic Plus', '#d97706', 'uk', 'UAH', $6::jsonb, $3::jsonb, $4, false)
       ON CONFLICT (id) DO NOTHING`,
      [
        PLATFORM_TENANT_ID,
        platformFeatures,
        audioPolicy,
        billingPlanId,
        CLINIC_TENANT_ID,
        clinicFeatures,
      ],
    );

    // ---------- platform super admin ----------
    const superAdminId = 'aaaaaaa0-0000-4000-8000-000000000000';
    await em.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, mfa_enabled, email_verified_at)
       VALUES ($1, 'super@telemed.local', $2, 'Платформа', 'Адмін', false, now())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [superAdminId, passwordHash],
    );
    await em.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, is_default)
       VALUES ($1, $2, 'PLATFORM_SUPER_ADMIN', true)
       ON CONFLICT ON CONSTRAINT uq_user_tenant_role DO NOTHING`,
      [superAdminId, PLATFORM_TENANT_ID],
    );

    // ---------- clinic admin ----------
    const clinicAdminId = 'aaaaaaa1-0000-4000-8000-000000000000';
    await em.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, mfa_enabled, email_verified_at)
       VALUES ($1, 'admin@clinic-a.local', $2, 'Олена', 'Адміністратор', false, now())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [clinicAdminId, passwordHash],
    );
    await em.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, is_default)
       VALUES ($1, $2, 'CLINIC_ADMIN', true)
       ON CONFLICT ON CONSTRAINT uq_user_tenant_role DO NOTHING`,
      [clinicAdminId, CLINIC_TENANT_ID],
    );

    // ---------- doctors ----------
    const doctors = [
      {
        userId: 'dddddd01-0000-4000-8000-000000000000',
        doctorId: 'dddddd01-0000-4000-8000-000000000000',
        email: 'doctor1@demo.local',
        firstName: 'Ірина',
        lastName: 'Коваленко',
        specs: ['Сімейна медицина'],
        languages: ['uk', 'en'],
        years: 10,
        price: 500,
      },
      {
        userId: 'dddddd02-0000-4000-8000-000000000000',
        doctorId: 'dddddd02-0000-4000-8000-000000000000',
        email: 'doctor2@demo.local',
        firstName: 'Андрій',
        lastName: 'Шевченко',
        specs: ['Кардіологія'],
        languages: ['uk'],
        years: 15,
        price: 800,
      },
      {
        userId: 'dddddd03-0000-4000-8000-000000000000',
        doctorId: 'dddddd03-0000-4000-8000-000000000000',
        email: 'doctor3@demo.local',
        firstName: 'Ольга',
        lastName: 'Бондар',
        specs: ['Педіатрія'],
        languages: ['uk', 'en'],
        years: 7,
        price: 600,
      },
    ];

    for (const d of doctors) {
      await em.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, mfa_enabled, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, false, now())
         ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [d.userId, d.email, passwordHash, d.firstName, d.lastName],
      );
      await em.query(
        `INSERT INTO doctors (id, user_id, first_name, last_name, specializations, languages, years_of_experience, base_price, default_duration_min, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 30, 'VERIFIED')
         ON CONFLICT (id) DO NOTHING`,
        [d.doctorId, d.userId, d.firstName, d.lastName, d.specs, d.languages, d.years, d.price],
      );
      // Doctor profile in both tenants
      await em.query(
        `INSERT INTO doctor_tenant_profiles (tenant_id, doctor_id, display_name, price, is_published, slot_source_is_mis)
         VALUES ($1, $2, $3, $4, true, false)
         ON CONFLICT ON CONSTRAINT uq_doctor_tenant DO NOTHING`,
        [PLATFORM_TENANT_ID, d.doctorId, `${d.firstName} ${d.lastName}`, d.price],
      );
      await em.query(
        `INSERT INTO doctor_tenant_profiles (tenant_id, doctor_id, display_name, price, is_published, slot_source_is_mis)
         VALUES ($1, $2, $3, $4, true, false)
         ON CONFLICT ON CONSTRAINT uq_doctor_tenant DO NOTHING`,
        [CLINIC_TENANT_ID, d.doctorId, `${d.firstName} ${d.lastName}`, d.price],
      );
      // Membership
      await em.query(
        `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, is_default)
         VALUES ($1, $2, 'DOCTOR', true)
         ON CONFLICT ON CONSTRAINT uq_user_tenant_role DO NOTHING`,
        [d.userId, PLATFORM_TENANT_ID],
      );
      await em.query(
        `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, is_default)
         VALUES ($1, $2, 'DOCTOR', false)
         ON CONFLICT ON CONSTRAINT uq_user_tenant_role DO NOTHING`,
        [d.userId, CLINIC_TENANT_ID],
      );
      // Service type per doctor in clinic tenant
      await em.query(
        `INSERT INTO service_types (tenant_id, doctor_id, code, name, duration_min, price, mode, is_follow_up)
         VALUES ($1, $2, 'INITIAL', 'Первинна онлайн-консультація', 30, $3, 'VIDEO', false)
         ON CONFLICT DO NOTHING`,
        [CLINIC_TENANT_ID, d.doctorId, d.price],
      );
      await em.query(
        `INSERT INTO service_types (tenant_id, doctor_id, code, name, duration_min, price, mode, is_follow_up)
         VALUES ($1, $2, 'INITIAL', 'Первинна онлайн-консультація', 30, $3, 'VIDEO', false)
         ON CONFLICT DO NOTHING`,
        [PLATFORM_TENANT_ID, d.doctorId, d.price],
      );
      // Availability Mon-Fri 09:00–17:00
      for (let weekday = 1; weekday <= 5; weekday += 1) {
        await em.query(
          `INSERT INTO availability_rules (tenant_id, doctor_id, weekday, start_time, end_time, buffer_min)
           VALUES ($1, $2, $3, '09:00', '17:00', 0)
           ON CONFLICT DO NOTHING`,
          [CLINIC_TENANT_ID, d.doctorId, weekday],
        );
        await em.query(
          `INSERT INTO availability_rules (tenant_id, doctor_id, weekday, start_time, end_time, buffer_min)
           VALUES ($1, $2, $3, '09:00', '17:00', 0)
           ON CONFLICT DO NOTHING`,
          [PLATFORM_TENANT_ID, d.doctorId, weekday],
        );
      }
    }

    // ---------- patients ----------
    for (let i = 1; i <= 10; i += 1) {
      // bbbbbb01..bbbbbb0a — same RFC v4 shape as the other seed UUIDs.
      const userId = `bbbbbb${i.toString(16).padStart(2, '0')}-0000-4000-8000-000000000000`;
      const patientId = userId;
      const email = `patient${i}@demo.local`;
      const phone = `+38050000000${i}`;
      await em.query(
        `INSERT INTO users (id, email, phone, password_hash, first_name, last_name, mfa_enabled, email_verified_at, phone_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, false, now(), now())
         ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [userId, email, phone, passwordHash, `Пацієнт${i}`, 'Тестовий'],
      );
      await em.query(
        `INSERT INTO patients (id, user_id, first_name, last_name, date_of_birth, gender, email, phone, preferred_locale)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uk')
         ON CONFLICT (id) DO NOTHING`,
        [
          patientId,
          userId,
          `Пацієнт${i}`,
          'Тестовий',
          '1990-01-01',
          i % 2 === 0 ? 'M' : 'F',
          email,
          phone,
        ],
      );
      await em.query(
        `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, is_default)
         VALUES ($1, $2, 'PATIENT', true)
         ON CONFLICT ON CONSTRAINT uq_user_tenant_role DO NOTHING`,
        [userId, PLATFORM_TENANT_ID],
      );
      await em.query(
        `INSERT INTO patient_tenant_profiles (tenant_id, patient_id)
         VALUES ($1, $2) ON CONFLICT ON CONSTRAINT uq_patient_tenant DO NOTHING`,
        [PLATFORM_TENANT_ID, patientId],
      );
    }

    // ---------- document templates ----------
    const templates = [
      ['Сімейна медицина', 'Загальний висновок'],
      ['Кардіологія', 'Кардіологічний висновок'],
      ['Педіатрія', 'Педіатричний висновок'],
    ];
    for (const [spec, name] of templates) {
      await em.query(
        `INSERT INTO document_templates (specialization, type, name, schema, default_values)
         VALUES ($1, 'CONCLUSION', $2, '{}'::jsonb, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [spec, name],
      );
    }

    // ---------- demo slots ----------
    // Clean up stale OPEN slots that are in the past so re-running seed
    // doesn't leave the demo doctors looking unbookable.
    await em.query(
      `DELETE FROM slots
       WHERE status = 'OPEN'
         AND source_is_mis = false
         AND start_at < now()`,
    );

    // Generate fresh slots: next 14 days, 10:00–13:00 UTC every 30 min (= 6 slots/day).
    const now = new Date();
    for (const d of doctors) {
      for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
        const day = new Date(now);
        day.setUTCDate(day.getUTCDate() + dayOffset);
        day.setUTCHours(10, 0, 0, 0);
        for (let i = 0; i < 6; i += 1) {
          const start = new Date(day.getTime() + i * 30 * 60_000);
          const end = new Date(start.getTime() + 30 * 60_000);
          for (const tenantId of [PLATFORM_TENANT_ID, CLINIC_TENANT_ID]) {
            const serviceTypeRow = await em.query(
              `SELECT id FROM service_types WHERE tenant_id = $1 AND doctor_id = $2 LIMIT 1`,
              [tenantId, d.doctorId],
            );
            if (!serviceTypeRow.length) continue;
            await em.query(
              `INSERT INTO slots (tenant_id, doctor_id, service_type_id, start_at, end_at, status)
               VALUES ($1, $2, $3, $4, $5, 'OPEN')
               ON CONFLICT ON CONSTRAINT uq_slot_doctor_start DO NOTHING`,
              [tenantId, d.doctorId, serviceTypeRow[0].id, start, end],
            );
          }
        }
      }
    }

    // ---------- tenant integration config ----------
    await em.query(
      `INSERT INTO tenant_integration_configs (tenant_id, connector, enabled, credentials, options)
       VALUES ($1, 'docdream', true, '{}'::jsonb, '{}'::jsonb)
       ON CONFLICT ON CONSTRAINT uq_tenant_connector DO NOTHING`,
      [CLINIC_TENANT_ID],
    );

    // ---------- revenue share rule (clinic) ----------
    await em.query(
      `INSERT INTO revenue_share_rules (tenant_id, platform_pct, clinic_pct, doctor_pct, mis_partner_pct)
       VALUES ($1, 15, 25, 60, 0) ON CONFLICT DO NOTHING`,
      [CLINIC_TENANT_ID],
    );
  });
}

async function main(): Promise<void> {
  const ds = dataSource;
  if (!ds.isInitialized) await ds.initialize();
  try {
    // Run migrations first if not yet applied
    const pending = await ds.showMigrations();
    if (pending) {
      // eslint-disable-next-line no-console
      console.log('Running pending migrations…');
      await ds.runMigrations();
    }
    await seed(ds);
    // eslint-disable-next-line no-console
    console.log('✅ Seed complete');
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', e);
  process.exit(1);
});
