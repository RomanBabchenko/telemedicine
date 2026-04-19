import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationApiKeys1700000006000 implements MigrationInterface {
  name = 'AddIntegrationApiKeys1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_api_keys (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     uuid        NOT NULL,
        connector_id  varchar(32) NOT NULL,
        key_hash      text        NOT NULL,
        key_masked    varchar(32) NOT NULL,
        name          varchar(128),
        ip_allowlist  text[],
        last_used_at  timestamptz,
        revoked_at    timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        created_by    uuid,
        updated_by    uuid
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_api_key_hash
        ON integration_api_keys (key_hash)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_integration_api_key_tenant_connector
        ON integration_api_keys (tenant_id, connector_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_integration_api_key_tenant
        ON integration_api_keys (tenant_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration_api_keys`);
  }
}
