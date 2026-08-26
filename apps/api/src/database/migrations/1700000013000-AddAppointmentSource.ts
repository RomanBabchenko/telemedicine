import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds a first-class "where did this appointment come from" discriminator.
// Until now MIS provenance was only derivable indirectly (slots.source_is_mis
// or an external_identities row), which is too fragile for role scoping —
// INTEGRATION_ADMIN must only ever see MIS-originated appointments.
//
// Backfill uses both signals: the slot flag (normal webhook path) and the
// external identity mapping (covers MIS appointments that landed on a
// pre-existing platform slot).
export class AddAppointmentSource1700000013000 implements MigrationInterface {
  name = 'AddAppointmentSource1700000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN "source" varchar(16) NOT NULL DEFAULT 'PLATFORM'`,
    );
    await queryRunner.query(`
      UPDATE "appointments" a
      SET "source" = 'MIS'
      FROM "slots" s
      WHERE a."slot_id" = s."id" AND s."source_is_mis" = true
    `);
    await queryRunner.query(`
      UPDATE "appointments" a
      SET "source" = 'MIS'
      FROM "external_identities" e
      WHERE e."entity_type" = 'APPOINTMENT'
        AND e."internal_id" = a."id"
        AND a."source" <> 'MIS'
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_appointment_tenant_source" ON "appointments" ("tenant_id", "source")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_appointment_tenant_source"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "source"`);
  }
}
