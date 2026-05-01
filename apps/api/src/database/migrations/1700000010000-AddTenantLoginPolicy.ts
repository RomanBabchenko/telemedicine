import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantLoginPolicy1700000010000 implements MigrationInterface {
  name = 'AddTenantLoginPolicy1700000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants
         ADD COLUMN IF NOT EXISTS login_policy jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants DROP COLUMN IF EXISTS login_policy`,
    );
  }
}
