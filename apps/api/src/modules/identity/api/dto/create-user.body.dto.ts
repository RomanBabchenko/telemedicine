import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '@telemed/shared-types';
import type { CreateUserDto } from '@telemed/shared-types';

const ROLE_VALUES: Role[] = [
  Role.PATIENT,
  Role.DOCTOR,
  Role.CLINIC_ADMIN,
  Role.CLINIC_OPERATOR,
  Role.PLATFORM_SUPPORT,
  Role.PLATFORM_FINANCE,
  Role.PLATFORM_SUPER_ADMIN,
  Role.MIS_SERVICE,
  Role.AUDITOR,
];

export class CreateUserBodyDto implements CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    minLength: 8,
    description: 'Optional password. When omitted the server generates a temporary one and returns it in the response.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @Length(1, 128)
  firstName!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @Length(1, 128)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ROLE_VALUES })
  @IsIn(ROLE_VALUES)
  role!: Role;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'PLATFORM_SUPER_ADMIN only — foreign tenant; CLINIC_ADMIN passes are ignored.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Mark this membership as the default tenant for the user' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  // Doctor-specific extras (used only when role === 'DOCTOR')
  @ApiPropertyOptional({ type: [String], description: 'DOCTOR-only: medical specializations' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @ApiPropertyOptional({ type: [String], description: 'DOCTOR-only: languages the doctor consults in' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ description: 'DOCTOR-only: professional license number' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'DOCTOR-only: years of experience' })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ description: 'DOCTOR-only: base consultation price' })
  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @ApiPropertyOptional({ minimum: 5, description: 'DOCTOR-only: default visit duration (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(5)
  defaultDurationMin?: number;

  @ApiPropertyOptional({ description: 'DOCTOR-only: free-form biography' })
  @IsOptional()
  @IsString()
  bio?: string;
}
