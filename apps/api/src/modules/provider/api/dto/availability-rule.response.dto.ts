import { ApiProperty } from '@nestjs/swagger';
import type { AvailabilityRuleDto } from '@telemed/shared-types';

export class AvailabilityRuleResponseDto implements AvailabilityRuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  doctorId!: string;

  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  weekday!: number;

  @ApiProperty({ description: 'HH:MM' })
  startTime!: string;

  @ApiProperty({ description: 'HH:MM' })
  endTime!: string;

  @ApiProperty()
  bufferMin!: number;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  serviceTypeId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  validFrom!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  validUntil!: string | null;
}
