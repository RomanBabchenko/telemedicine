import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { CancelAppointmentDto } from '@telemed/shared-types';

export class CancelBodyDto implements CancelAppointmentDto {
  @ApiPropertyOptional({ maxLength: 512, description: 'Cancellation reason (stored for audit)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
