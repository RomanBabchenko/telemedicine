import { MigrationInterface, QueryRunner } from 'typeorm';

// Auto-recording now honours `audio_policy.enabled` (previously only the
// manual start path did). Tenants provisioned before the policy had a UI
// carry the column default `{}`, i.e. no `enabled` key — and a missing key
// now means "off". Keep recording on for clinics that already have the
// audioArchive module; everyone else stays off until they opt in.
export class EnableAudioPolicyWhereArchiveOn1700000015000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenants"
       SET "audio_policy" = "audio_policy" || '{"enabled": true}'::jsonb
       WHERE ("feature_matrix"->>'audioArchive')::boolean IS TRUE
         AND "audio_policy"->>'enabled' IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // Data backfill — there is no way to tell which rows had the key set by
    // hand, so leave the flag in place.
  }
}
