import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import type { CreateAvailabilityRuleDto } from '@telemed/shared-types';

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleBodyDto implements CreateAvailabilityRuleDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday … 6 = Saturday',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ description: "Start time HH:MM (24h, doctor-local timezone)" })
  @IsString()
  @Matches(TIME_RE, { message: 'startTime must be HH:MM (24h)' })
  startTime!: string;

  @ApiProperty({ description: "End time HH:MM (24h, doctor-local timezone)" })
  @IsString()
  @Matches(TIME_RE, { message: 'endTime must be HH:MM (24h)' })
  endTime!: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Buffer between consecutive slots (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bufferMin?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restrict rule to a specific service type' })
  @IsOptional()
  @IsUUID()
  serviceTypeId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
