import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The original `uq_slot_doctor_start` was UNIQUE (doctor_id, start_at).
 * That collapses cross-tenant inserts: if the same doctor is exposed in
 * multiple clinics, only the first tenant's slot row survives — the others
 * are eaten by `ON CONFLICT DO NOTHING`. The seed script was hitting this
 * exact path and leaving CLINIC_TENANT_ID with zero slots.
 *
 * We make the constraint per-tenant: (tenant_id, doctor_id, start_at).
 */
export class FixSlotUniquePerTenant1700000001000 implements MigrationInterface {
  name = 'FixSlotUniquePerTenant1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "slots" DROP CONSTRAINT IF EXISTS "uq_slot_doctor_start"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slots"
       ADD CONSTRAINT "uq_slot_doctor_start"
       UNIQUE ("tenant_id", "doctor_id", "start_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "slots" DROP CONSTRAINT IF EXISTS "uq_slot_doctor_start"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slots"
       ADD CONSTRAINT "uq_slot_doctor_start"
       UNIQUE ("doctor_id", "start_at")`,
    );
  }
}
