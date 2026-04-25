import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  MinLength,
} from 'class-validator';
import type { CreateDoctorDto } from '@telemed/shared-types';

export class CreateDoctorBodyDto implements CreateDoctorDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @Length(1, 128)
  firstName!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @Length(1, 128)
  lastName!: string;

  @ApiProperty({ type: [String], description: 'Primary medical specializations' })
  @IsArray()
  @IsString({ each: true })
  specializations!: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ description: 'Free-form biography' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Photo URL (external storage)' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Base consultation price' })
  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @ApiPropertyOptional({ minimum: 5, description: 'Default visit duration (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(5)
  defaultDurationMin?: number;
}
