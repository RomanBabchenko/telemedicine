import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ReserveAppointmentDto } from '@telemed/shared-types';

export class ReserveBodyDto implements ReserveAppointmentDto {
  @ApiProperty({ format: 'uuid', description: 'Slot being reserved' })
  @IsUUID()
  slotId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Target patient. Patients may omit this to reserve for themselves; operators/admins must supply it.',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ maxLength: 1024, description: 'Free-form chief complaint / reason' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  reasonText?: string;
}
