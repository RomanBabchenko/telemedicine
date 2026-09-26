import { MigrationInterface, QueryRunner } from 'typeorm';

// Recording notice shown to doctor and patient before joining a consultation.
// - tenants.consultation_policy: video-module settings (on/off, custom text,
//   public offer URL). Empty object = defaults (notice on, default text).
// - consultation_sessions.*_recording_notice_at: when each side accepted, so
//   a reconnect doesn't ask again and join-token can enforce it.
// Additive + nullable/defaulted, safe to run under a live API.
export class AddRecordingNotice1700000018000 implements MigrationInterface {
  name = 'AddRecordingNotice1700000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "consultation_policy" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "consultation_sessions" ADD COLUMN IF NOT EXISTS "doctor_recording_notice_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "consultation_sessions" ADD COLUMN IF NOT EXISTS "patient_recording_notice_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consultation_sessions" DROP COLUMN IF EXISTS "patient_recording_notice_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "consultation_sessions" DROP COLUMN IF EXISTS "doctor_recording_notice_at"`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "consultation_policy"`);
  }
}
