import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * MIS-driven reschedule. The MIS owns its own scheduling — we accept the new
 * times as ISO-8601 strings and let our side find/create the slot to match.
 * Native client reschedule (with newSlotId) is a separate, future feature;
 * see RescheduleAppointmentDto in @telemed/shared-types.
 */
export class RescheduleAppointmentBodyDto {
  @ApiProperty({ format: 'date-time', description: 'New appointment start (ISO-8601)' })
  @IsISO8601()
  startAt!: string;

  @ApiProperty({ format: 'date-time', description: 'New appointment end (ISO-8601)' })
  @IsISO8601()
  endAt!: string;

  @ApiPropertyOptional({ description: 'Optional reason for the reschedule', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
