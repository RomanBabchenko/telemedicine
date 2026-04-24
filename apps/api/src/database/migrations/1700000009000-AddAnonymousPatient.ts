import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnonymousPatient1700000009000 implements MigrationInterface {
  name = 'AddAnonymousPatient1700000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE appointments
         ADD COLUMN IF NOT EXISTS is_anonymous_patient boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE appointments
         ADD CONSTRAINT chk_appointment_patient_presence
         CHECK (patient_id IS NOT NULL OR is_anonymous_patient = true)`,
    );
    // Swap covering index for a partial one so null patient_id rows (anonymous
    // appointments) do not bloat the index. Every runtime query on patient_id
    // already passes a real uuid, so the partial form is a strict improvement.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_appointment_patient`);
    await queryRunner.query(
      `CREATE INDEX idx_appointment_patient ON appointments (patient_id)
         WHERE patient_id IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE consultation_invites ALTER COLUMN user_id DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse to revert if anonymous rows exist — the migration is not lossy.
    // Operators must decide how to handle those rows (delete or migrate)
    // before bringing the NOT NULL back.
    const anonCount = await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM appointments WHERE patient_id IS NULL`,
    );
    if (Number(anonCount?.[0]?.count ?? 0) > 0) {
      throw new Error(
        'Refusing to revert AddAnonymousPatient: appointments with patient_id IS NULL exist. ' +
          'Resolve them manually (delete or backfill) before running this down migration.',
      );
    }
    const anonInvites = await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM consultation_invites WHERE user_id IS NULL`,
    );
    if (Number(anonInvites?.[0]?.count ?? 0) > 0) {
      throw new Error(
        'Refusing to revert AddAnonymousPatient: consultation_invites with user_id IS NULL exist.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE consultation_invites ALTER COLUMN user_id SET NOT NULL`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS idx_appointment_patient`);
    await queryRunner.query(
      `CREATE INDEX idx_appointment_patient ON appointments (patient_id)`,
    );
    await queryRunner.query(
      `ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointment_patient_presence`,
    );
    await queryRunner.query(
      `ALTER TABLE appointments DROP COLUMN IF EXISTS is_anonymous_patient`,
    );
    await queryRunner.query(`ALTER TABLE appointments ALTER COLUMN patient_id SET NOT NULL`);
  }
}
