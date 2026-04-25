import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { UpdatePatientDto } from '@telemed/shared-types';

export class UpdatePatientBodyDto implements UpdatePatientDto {
  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  lastName?: string;

  @ApiPropertyOptional({ format: 'date', description: 'ISO-8601 date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  preferredLocale?: string;
}
