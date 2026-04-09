import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Earlier the `DELETE /doctors/:id` flow soft-removed the Doctor row
 * (deleted_at IS NOT NULL), which prevented the corresponding User row
 * from being recreated with the same email — `findByEmail` still found
 * the user and the create flow died with 409.
 *
 * The new behaviour is "deactivate" instead of "delete": flip
 * doctor_tenant_profiles.is_published to false and leave the doctor row
 * intact.
 *
 * This migration retrofits old data into the new model:
 *   1. Mark every tenant profile of a soft-deleted doctor as unpublished
 *      (so they don't show up on public listings).
 *   2. Clear deleted_at on the doctor row, so the admin sees them in the
 *      list and can re-activate them.
 *
 * Idempotent: re-running is a no-op.
 */
export class RestoreSoftDeletedDoctors1700000002000 implements MigrationInterface {
  name = 'RestoreSoftDeletedDoctors1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE doctor_tenant_profiles
      SET is_published = false
      WHERE doctor_id IN (
        SELECT id FROM doctors WHERE deleted_at IS NOT NULL
      )
    `);

    await queryRunner.query(`
      UPDATE doctors
      SET deleted_at = NULL
      WHERE deleted_at IS NOT NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally not reversible — we can't tell which doctors were
    // historically soft-deleted vs simply deactivated by the new flow.
  }
}
