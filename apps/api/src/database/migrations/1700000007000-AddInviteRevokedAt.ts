import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInviteRevokedAt1700000007000 implements MigrationInterface {
  name = 'AddInviteRevokedAt1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE consultation_invites
         ADD COLUMN IF NOT EXISTS revoked_at timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE consultation_invites
         DROP COLUMN IF EXISTS revoked_at`,
    );
  }
}
