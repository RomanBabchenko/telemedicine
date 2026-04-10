import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsultationInvites1700000004000 implements MigrationInterface {
  name = 'AddConsultationInvites1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultation_invites (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     uuid        NOT NULL,
        token_hash    text        NOT NULL,
        appointment_id uuid       NOT NULL,
        consultation_session_id uuid NOT NULL,
        user_id       uuid        NOT NULL,
        role          varchar(16) NOT NULL,
        expires_at    timestamptz NOT NULL,
        consumed_at   timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        created_by    uuid,
        updated_by    uuid
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_invite_token_hash
        ON consultation_invites (token_hash)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_invite_tenant
        ON consultation_invites (tenant_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consultation_invites`);
  }
}
