import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMisPaymentFields1700000005000 implements MigrationInterface {
  name = 'AddMisPaymentFields1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS mis_payment_type varchar(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS mis_payment_status varchar(16)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE appointments DROP COLUMN IF EXISTS mis_payment_status`,
    );
    await queryRunner.query(
      `ALTER TABLE appointments DROP COLUMN IF EXISTS mis_payment_type`,
    );
  }
}
