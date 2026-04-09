import { Column, DeleteDateColumn, Entity, Index, VersionColumn } from 'typeorm';
import { DocumentStatus, DocumentType } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('medical_documents')
@Index('idx_doc_appointment', ['appointmentId'])
@Index('idx_doc_patient', ['patientId'])
export class MedicalDocument extends TenantOwnedEntity {
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'author_doctor_id', type: 'uuid' })
  authorDoctorId!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar', length: 32, enum: DocumentType, default: DocumentType.CONCLUSION })
  type!: DocumentType;

  @Column({
    type: 'varchar',
    length: 16,
    enum: DocumentStatus,
    default: DocumentStatus.DRAFT,
  })
  status!: DocumentStatus;

  @Column({ name: 'structured_content', type: 'jsonb', default: () => `'{}'::jsonb` })
  structuredContent!: Record<string, unknown>;

  @Column({ name: 'pdf_file_asset_id', type: 'uuid', nullable: true })
  pdfFileAssetId!: string | null;

  @Column({ name: 'parent_document_id', type: 'uuid', nullable: true })
  parentDocumentId!: string | null;

  @VersionColumn({ default: 1 })
  version!: number;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt!: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
