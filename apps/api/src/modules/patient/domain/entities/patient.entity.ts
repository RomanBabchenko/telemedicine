import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('patients')
export class Patient extends BaseEntity {
  @Index({ unique: true, where: '"user_id" IS NOT NULL' })
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 128 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 128 })
  lastName!: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gender!: string | null;

  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'preferred_locale', type: 'varchar', length: 8, default: 'uk' })
  preferredLocale!: string;

  @Column({ name: 'master_patient_id', type: 'uuid', nullable: true })
  masterPatientId!: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
