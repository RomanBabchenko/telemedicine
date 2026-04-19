import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantInvitePolicy1700000008000 implements MigrationInterface {
  name = 'AddTenantInvitePolicy1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants
         ADD COLUMN IF NOT EXISTS invite_policy jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants DROP COLUMN IF EXISTS invite_policy`,
    );
  }
}
