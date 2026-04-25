import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '@telemed/shared-types';
import { PrescriptionItemDto } from './prescription-item.dto';

export class PrescriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ format: 'uuid' })
  doctorId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ type: [PrescriptionItemDto] })
  items!: PrescriptionItemDto[];

  @ApiProperty({ enum: Object.values(DocumentStatus) })
  status!: DocumentStatus;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  pdfFileAssetId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  signedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
