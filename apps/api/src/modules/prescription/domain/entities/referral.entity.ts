import { Column, Entity, Index } from 'typeorm';
import { DocumentStatus, ReferralTargetType } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('referrals')
@Index('idx_referral_appointment', ['appointmentId'])
export class Referral extends TenantOwnedEntity {
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({
    name: 'target_type',
    type: 'varchar',
    length: 32,
    enum: ReferralTargetType,
    default: ReferralTargetType.SPECIALIST,
  })
  targetType!: ReferralTargetType;

  @Column({ type: 'text' })
  instructions!: string;

  @Column({
    type: 'varchar',
    length: 16,
    enum: DocumentStatus,
    default: DocumentStatus.DRAFT,
  })
  status!: DocumentStatus;

  @Column({ name: 'pdf_file_asset_id', type: 'uuid', nullable: true })
  pdfFileAssetId!: string | null;
}
