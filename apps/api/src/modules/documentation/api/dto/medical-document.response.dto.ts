import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus, DocumentType } from '@telemed/shared-types';

export class MedicalDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ format: 'uuid' })
  authorDoctorId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ enum: Object.values(DocumentType) })
  type!: DocumentType;

  @ApiProperty({ enum: Object.values(DocumentStatus) })
  status!: DocumentStatus;

  @ApiProperty({ type: Object, description: 'Structured document content (shape depends on type)' })
  structuredContent!: Record<string, unknown>;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  pdfFileAssetId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  parentDocumentId!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  signedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
