import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill DoctorTenantProfile + ServiceType + AvailabilityRule for every
 * user_tenant_membership(role=DOCTOR) that doesn't already have them.
 *
 * Why this exists: until now, granting an existing user the DOCTOR role
 * via /admin/users → AddMembershipModal only inserted into
 * user_tenant_memberships. The provider catalog reads
 * doctor_tenant_profiles, so the user would have the role but be invisible
 * to patients in that tenant. From here on AdminUserController.addMembership
 * delegates to ProviderService.attachToTenant which fixes new memberships
 * — this migration patches the historical ones.
 *
 * Slots are intentionally NOT inserted: they are time-based and the
 * existing "Слоти" button on /doctors regenerates them per-doctor on
 * demand. This migration only restores the catalog visibility + booking
 * pre-requisites (profile, service type, weekly schedule).
 *
 * Idempotent: re-running is a no-op thanks to the NOT EXISTS guards.
 */
export class BackfillDoctorTenantProfiles1700000003000
  implements MigrationInterface
{
  name = 'BackfillDoctorTenantProfiles1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. DoctorTenantProfile
    await queryRunner.query(`
      INSERT INTO doctor_tenant_profiles
        (tenant_id, doctor_id, display_name, price, is_published, slot_source_is_mis)
      SELECT DISTINCT
        m.tenant_id,
        d.id,
        d.first_name || ' ' || d.last_name,
        d.base_price,
        true,
        false
      FROM user_tenant_memberships m
      JOIN doctors d ON d.user_id = m.user_id
      WHERE m.role = 'DOCTOR'
        AND NOT EXISTS (
          SELECT 1 FROM doctor_tenant_profiles p
          WHERE p.doctor_id = d.id AND p.tenant_id = m.tenant_id
        )
    `);

    // 2. ServiceType (one per doctor per tenant)
    await queryRunner.query(`
      INSERT INTO service_types
        (tenant_id, doctor_id, code, name, duration_min, price, mode, is_follow_up)
      SELECT DISTINCT
        m.tenant_id,
        d.id,
        'INITIAL',
        'Первинна онлайн-консультація',
        d.default_duration_min,
        d.base_price,
        'VIDEO',
        false
      FROM user_tenant_memberships m
      JOIN doctors d ON d.user_id = m.user_id
      WHERE m.role = 'DOCTOR'
        AND NOT EXISTS (
          SELECT 1 FROM service_types s
          WHERE s.doctor_id = d.id AND s.tenant_id = m.tenant_id
        )
    `);

    // 3. AvailabilityRule — Mon..Fri 09:00–17:00, linked to that ServiceType
    await queryRunner.query(`
      INSERT INTO availability_rules
        (tenant_id, doctor_id, weekday, start_time, end_time, buffer_min, service_type_id)
      SELECT
        s.tenant_id,
        s.doctor_id,
        weekday,
        '09:00'::time,
        '17:00'::time,
        0,
        s.id
      FROM service_types s
      JOIN user_tenant_memberships m
        ON m.tenant_id = s.tenant_id AND m.role = 'DOCTOR'
      JOIN doctors d
        ON d.id = s.doctor_id AND d.user_id = m.user_id
      CROSS JOIN generate_series(1, 5) AS weekday
      WHERE NOT EXISTS (
        SELECT 1 FROM availability_rules r
        WHERE r.doctor_id = s.doctor_id
          AND r.tenant_id = s.tenant_id
          AND r.weekday = weekday
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally not reversible — we can't tell which rows were added
    // by this backfill vs by regular product flows after the fact.
  }
}
