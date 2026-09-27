import { MigrationInterface, QueryRunner } from 'typeorm';

// Post-consultation patient feedback («оцінка консультації»): one row per
// appointment, written once by the patient right after the doctor ends the
// call, read by the clinic admin console (list filter/sort + details).
//
//   uq_appointment_feedback_appointment  — one answer per appointment; the
//                                          insert races on a double-click
//                                          and the service maps 23505 → 409
//   chk_*                                — value domains mirror the
//                                          shared-types unions
//   idx_*_tenant_clarity                 — admin list filter/sort by stars
//   idx_*_tenant_doctor                  — future per-doctor aggregation
//
// submitted_by_user_id stays NULL for anonymous-invite patients: their
// user.id is a ConsultationInvite pseudonym, not a users(id) value.
export class AddAppointmentFeedbacks1700000017000 implements MigrationInterface {
  name = 'AddAppointmentFeedbacks1700000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "appointment_feedbacks" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "consultation_session_id" uuid,
        "doctor_id" uuid NOT NULL,
        "patient_id" uuid,
        "resolved" varchar(16) NOT NULL,
        "clarity_rating" smallint NOT NULL,
        "submitted_by_user_id" uuid,
        "submitted_scope" varchar(16) NOT NULL DEFAULT 'full',
        "submitted_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_appointment_feedback_appointment" UNIQUE ("appointment_id"),
        CONSTRAINT "chk_appointment_feedback_resolved"
          CHECK ("resolved" IN ('YES', 'PARTIALLY', 'NO')),
        CONSTRAINT "chk_appointment_feedback_clarity"
          CHECK ("clarity_rating" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_appointment_feedback_tenant" ON "appointment_feedbacks" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_appointment_feedback_tenant_clarity" ON "appointment_feedbacks" ("tenant_id", "clarity_rating")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_appointment_feedback_tenant_doctor" ON "appointment_feedbacks" ("tenant_id", "doctor_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "appointment_feedbacks" CASCADE`);
  }
}
