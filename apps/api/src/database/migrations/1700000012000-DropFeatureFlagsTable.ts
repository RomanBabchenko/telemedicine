import { MigrationInterface, QueryRunner } from 'typeorm';

// feature_flags was a second, never-read data model for clinic modules —
// the live one is tenants.feature_matrix (jsonb). The entity is deleted;
// drop the orphaned table.
export class DropFeatureFlagsTable1700000012000 implements MigrationInterface {
  name = 'DropFeatureFlagsTable1700000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_flags"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "key" varchar(128) NOT NULL,
        "value" jsonb NOT NULL DEFAULT 'true'::jsonb,
        CONSTRAINT "uq_feature_flag_tenant_key" UNIQUE ("tenant_id", "key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_feature_flag_tenant" ON "feature_flags" ("tenant_id")`,
    );
  }
}
