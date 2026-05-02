import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordingEgresses1700000011000 implements MigrationInterface {
  name = 'AddRecordingEgresses1700000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-track egress rows: one per audio track per recording.
    // Replaces the single session_recordings.egress_id column for new
    // recordings (column is left in place and nullable for legacy rows
    // that were produced by the RoomComposite path).
    //
    //   uq_recording_egress_egress_id    — webhook lookup by egressId
    //   uq_recording_egress_track        — idempotency: catch-up start in
    //                                      RecordingService races with
    //                                      track_published webhook
    await queryRunner.query(`
      CREATE TABLE "recording_egresses" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "recording_id" uuid NOT NULL,
        "egress_id" varchar(128) NOT NULL,
        "participant_identity" varchar(256) NOT NULL,
        "track_sid" varchar(128) NOT NULL,
        "object_key" varchar(512) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'RECORDING',
        "duration_sec" int NOT NULL DEFAULT 0,
        "started_at" timestamptz,
        "ended_at" timestamptz,
        CONSTRAINT "uq_recording_egress_egress_id" UNIQUE ("egress_id"),
        CONSTRAINT "uq_recording_egress_track" UNIQUE ("recording_id", "track_sid")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_recording_egress_recording" ON "recording_egresses" ("recording_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recording_egress_tenant" ON "recording_egresses" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recording_egress_status" ON "recording_egresses" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "recording_egresses" CASCADE`);
  }
}
