import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus, DocumentType } from '@telemed/shared-types';
import { AppointmentDoctorSummaryDto } from '../../../booking/api/dto/appointment.response.dto';

/**
 * Patient-facing document row for GET /patients/me/documents.
 * pdfUrl is deliberately null here — callers use GET /documents/:id/pdf
 * to obtain a signed short-lived download URL when needed.
 */
export class PatientDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

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

  @ApiProperty({ type: Object, nullable: true })
  structuredContent!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  pdfUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  signedAt!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  parentDocumentId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: AppointmentDoctorSummaryDto })
  doctor?: AppointmentDoctorSummaryDto;
}
