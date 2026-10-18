import { MigrationInterface, QueryRunner } from 'typeorm';

// Per-appointment document upload target supplied by the MIS (DocDream)
// at appointment creation. Patient files are relayed to this URL by
// POST /appointments/:id/mis-documents; nothing is stored on our side.
// Nullable — platform-booked and pre-feature MIS appointments stay null.
// Additive, safe under a live API.
export class AddAppointmentMisDocumentUploadUrl1700000020000 implements MigrationInterface {
  name = 'AddAppointmentMisDocumentUploadUrl1700000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "mis_document_upload_url" varchar(2048)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN IF EXISTS "mis_document_upload_url"`,
    );
  }
}
