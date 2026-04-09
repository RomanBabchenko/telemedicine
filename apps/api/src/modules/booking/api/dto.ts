import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty() @IsString() doctorId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceTypeId?: string;
  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() to!: string;
}

export class ReserveBodyDto {
  @ApiProperty() @IsString() slotId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() patientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reasonText?: string;
}

export class CancelBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class RescheduleBodyDto {
  @ApiProperty() @IsString() newSlotId!: string;
}
