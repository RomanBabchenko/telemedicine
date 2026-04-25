import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Doctor whose slots are being queried' })
  @IsUUID()
  doctorId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restrict to slots matching this service type' })
  @IsOptional()
  @IsUUID()
  serviceTypeId?: string;

  @ApiProperty({ format: 'date-time', description: 'Window start (inclusive, ISO-8601)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ format: 'date-time', description: 'Window end (exclusive, ISO-8601)' })
  @IsDateString()
  to!: string;
}
