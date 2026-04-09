import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class DoctorSearchQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() specialization?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class CreateDoctorBodyDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() @Length(1, 128) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 128) lastName!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  specializations!: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) yearsOfExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() basePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) defaultDurationMin?: number;
}

export class UpdateDoctorBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 128) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 128) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() basePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() defaultDurationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) specializations?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) subspecializations?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) yearsOfExperience?: number;
}

export class CreateAvailabilityRuleBodyDto {
  @ApiProperty() @IsInt() @Min(0) @Max(6) weekday!: number;
  @ApiProperty() @IsString() startTime!: string;
  @ApiProperty() @IsString() endTime!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() bufferMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validUntil?: string;
}
