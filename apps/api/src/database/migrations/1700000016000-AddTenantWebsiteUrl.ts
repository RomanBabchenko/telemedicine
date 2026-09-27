import { MigrationInterface, QueryRunner } from 'typeorm';

// Clinic's public website. Target of the «Повернутися на сайт клініки»
// button on the patient's post-call screen; null hides the button. Edited
// on the admin Branding page. Additive + nullable, so the running API keeps
// working while the migration lands.
export class AddTenantWebsiteUrl1700000016000 implements MigrationInterface {
  name = 'AddTenantWebsiteUrl1700000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "website_url" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "website_url"`);
  }
}
