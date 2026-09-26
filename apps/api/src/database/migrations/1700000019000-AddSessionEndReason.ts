import { MigrationInterface, QueryRunner } from 'typeorm';

// Why a consultation session ended: DOCTOR (explicit end), AUTO_TIMEOUT
// (closed by the stale-consultation sweeper after the join window) or
// RECORDING_DECLINED. Nullable — sessions ended before this column existed
// stay null. Additive, safe under a live API.
export class AddSessionEndReason1700000019000 implements MigrationInterface {
  name = 'AddSessionEndReason1700000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consultation_sessions" ADD COLUMN IF NOT EXISTS "end_reason" varchar(24)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "consultation_sessions" DROP COLUMN IF EXISTS "end_reason"`,
    );
  }
}
