import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentBodyDto {
  @ApiPropertyOptional({ description: 'Human-readable cancellation reason', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
