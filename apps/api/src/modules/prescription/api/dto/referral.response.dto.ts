import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus, ReferralTargetType } from '@telemed/shared-types';

export class ReferralResponseDto {
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

  @ApiProperty({ enum: Object.values(ReferralTargetType) })
  targetType!: ReferralTargetType;

  @ApiProperty()
  instructions!: string;

  @ApiProperty({ enum: Object.values(DocumentStatus) })
  status!: DocumentStatus;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  pdfFileAssetId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
