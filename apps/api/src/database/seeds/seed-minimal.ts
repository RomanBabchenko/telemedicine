import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DEFAULT_FEATURE_MATRIX } from '@telemed/shared-types';
import dataSource from '../../config/typeorm.config';
import { hashPassword } from '../../common/crypto/password.util';

loadEnv({ path: join(process.cwd(), '..', '..', '.env') });
loadEnv({ path: join(process.cwd(), '.env'), override: false });

// Production bootstrap seed: ONLY the platform tenant and one super admin.
// No demo clinics, doctors, patients or slots — clinics are created later
// through the admin console (which also gives them their subdomain).
// Idempotent: re-running never rotates an existing admin's password.
//
// PLATFORM_TENANT_ID must come from the environment and match the API's
// .env — the tenant-resolver middleware falls back to it, so seeding a
// different id than the API uses would break every tokenless request.
const PLATFORM_TENANT_ID = process.env.PLATFORM_TENANT_ID;
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'super@telemed.local';

async function seedMinimal(ds: DataSource, platformTenantId: string): Promise<void> {
  await ds.transaction(async (em) => {
    // ---------- platform tenant ----------
    // The middleware falls back to this tenant for requests without an
    // X-Tenant-Id / JWT / clinic subdomain, so the row must exist.
    await em.query(
      `INSERT INTO tenants (id, slug, subdomain, brand_name, primary_color, locale, currency, feature_matrix, is_platform)
       VALUES ($1, 'platform', 'app', 'Telemed Platform', '#1f7ae0', 'uk', 'UAH', $2::jsonb, true)
       ON CONFLICT (id) DO NOTHING`,
      [platformTenantId, JSON.stringify(DEFAULT_FEATURE_MATRIX)],
    );

    // ---------- platform super admin ----------
    const existing: Array<{ id: string }> = await em.query(
      `SELECT id FROM users WHERE email = $1`,
      [SUPER_ADMIN_EMAIL],
    );
    let superAdminId: string;
    if (existing.length > 0) {
      superAdminId = existing[0].id;
      console.log(`Super admin ${SUPER_ADMIN_EMAIL} already exists — password unchanged.`);
    } else {
      superAdminId = randomUUID();
      const password =
        process.env.SUPER_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
      const passwordHash = await hashPassword(password);
      await em.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, mfa_enabled, email_verified_at)
         VALUES ($1, $2, $3, 'Платформа', 'Адмін', false, now())`,
        [superAdminId, SUPER_ADMIN_EMAIL, passwordHash],
      );
      if (process.env.SUPER_ADMIN_PASSWORD) {
        console.log(`Super admin created: ${SUPER_ADMIN_EMAIL} (password from SUPER_ADMIN_PASSWORD).`);
      } else {
        // Printed exactly once, on creation — store it right away.
        console.log(`Super admin created: ${SUPER_ADMIN_EMAIL}`);
        console.log(`Generated password: ${password}`);
      }
    }
    await em.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, is_default)
       VALUES ($1, $2, 'PLATFORM_SUPER_ADMIN', true)
       ON CONFLICT ON CONSTRAINT uq_user_tenant_role DO NOTHING`,
      [superAdminId, platformTenantId],
    );
  });
}

async function main(): Promise<void> {
  if (!PLATFORM_TENANT_ID) {
    console.error(
      'PLATFORM_TENANT_ID is not set. Generate one (`uuidgen`), put it in .env ' +
        '(the API reads the same value) and re-run.',
    );
    process.exit(1);
  }
  const ds = await dataSource.initialize();
  try {
    await seedMinimal(ds, PLATFORM_TENANT_ID);
    console.log('✅ Minimal seed complete (platform tenant + super admin).');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Minimal seed failed:', err);
  process.exit(1);
});