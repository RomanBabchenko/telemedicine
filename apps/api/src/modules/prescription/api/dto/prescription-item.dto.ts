import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { PrescriptionItemDto as PrescriptionItemContract } from '@telemed/shared-types';

export class PrescriptionItemDto implements PrescriptionItemContract {
  @ApiProperty({ description: 'Drug / active ingredient name' })
  @IsString()
  @MaxLength(256)
  drug!: string;

  @ApiProperty({ example: '500mg' })
  @IsString()
  @MaxLength(64)
  dosage!: string;

  @ApiProperty({ example: '2 times a day' })
  @IsString()
  @MaxLength(128)
  frequency!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({ description: 'Free-form instructions (e.g. "after meals")' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;
}
