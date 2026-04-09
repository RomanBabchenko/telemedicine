import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { VerificationStatus } from '@telemed/shared-types';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('doctors')
export class Doctor extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 128 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 128 })
  lastName!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  specializations!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  subspecializations!: string[];

  @Column({ name: 'license_number', type: 'varchar', length: 64, nullable: true })
  licenseNumber!: string | null;

  @Column({ name: 'years_of_experience', type: 'int', default: 0 })
  yearsOfExperience!: number;

  @Column({ type: 'text', array: true, default: '{}' })
  languages!: string[];

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl!: string | null;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 16,
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  verificationStatus!: VerificationStatus;

  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true })
  rating!: string | null;

  @Column({ name: 'base_price', type: 'numeric', precision: 12, scale: 2, default: 0 })
  basePrice!: string;

  @Column({ name: 'default_duration_min', type: 'int', default: 30 })
  defaultDurationMin!: number;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
