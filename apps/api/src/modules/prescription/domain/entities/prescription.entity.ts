import { Column, Entity, Index } from 'typeorm';
import { DocumentStatus } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

export interface PrescriptionItem {
  drug: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  notes?: string;
}

@Entity('prescriptions')
@Index('idx_prescription_appointment', ['appointmentId'])
export class Prescription extends TenantOwnedEntity {
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  items!: PrescriptionItem[];

  @Column({
    type: 'varchar',
    length: 16,
    enum: DocumentStatus,
    default: DocumentStatus.DRAFT,
  })
  status!: DocumentStatus;

  @Column({ name: 'pdf_file_asset_id', type: 'uuid', nullable: true })
  pdfFileAssetId!: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt!: Date | null;
}
