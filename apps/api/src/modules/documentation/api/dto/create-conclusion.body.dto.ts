import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { CreateConclusionDto } from '@telemed/shared-types';

export class CreateConclusionBodyDto implements CreateConclusionDto {
  @ApiProperty({ description: 'Primary diagnosis' })
  @IsString()
  @MaxLength(2048)
  diagnosis!: string;

  @ApiProperty({ description: 'Recommendations / treatment plan' })
  @IsString()
  @MaxLength(4096)
  recommendations!: string;

  @ApiPropertyOptional({ description: 'Private notes for the doctor' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  notes?: string;

  @ApiPropertyOptional({ minimum: 1, description: 'Suggested follow-up interval in days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  followUpInDays?: number;
}
