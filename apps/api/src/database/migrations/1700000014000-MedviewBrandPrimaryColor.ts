import { MigrationInterface, QueryRunner } from 'typeorm';

// MedView rebrand ("Pulse Play", brand guide v2.0): the platform default
// primary color moves from #1f7ae0 to Clinical Blue #2563EB.
// Rows still on #1f7ae0 never chose it — it was only ever the implicit
// default — so they are moved too; explicitly branded tenants keep theirs.
export class MedviewBrandPrimaryColor1700000014000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ALTER COLUMN "primary_color" SET DEFAULT '#2563EB'`,
    );
    await queryRunner.query(
      `UPDATE "tenants" SET "primary_color" = '#2563EB' WHERE "primary_color" = '#1f7ae0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ALTER COLUMN "primary_color" SET DEFAULT '#1f7ae0'`,
    );
    await queryRunner.query(
      `UPDATE "tenants" SET "primary_color" = '#1f7ae0' WHERE "primary_color" = '#2563EB'`,
    );
  }
}
