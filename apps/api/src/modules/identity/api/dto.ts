import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '@telemed/shared-types';

export class RegisterPatientBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() @Length(1, 128) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 128) lastName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferredLocale?: string;
}

export class LoginBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @IsNotEmpty() password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mfaCode?: string;
}

export class OtpRequestBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class OtpVerifyBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @Length(4, 10) code!: string;
}

export class MagicLinkRequestBodyDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class MagicLinkConsumeBodyDto {
  @ApiProperty() @IsString() token!: string;
}

export class RefreshBodyDto {
  @ApiProperty() @IsString() refreshToken!: string;
}

export class MfaVerifyBodyDto {
  @ApiProperty() @IsString() @Length(6, 6) code!: string;
}

export class RegisterDoctorBodyDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() firstName!: string;
  @ApiProperty() @IsString() lastName!: string;
  @ApiProperty({ type: [String] }) @IsString({ each: true }) specializations!: string[];
  @ApiProperty() @IsString() licenseNumber!: string;
  @ApiProperty() yearsOfExperience!: number;
  @ApiProperty({ type: [String] }) @IsString({ each: true }) languages!: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin user / membership DTOs
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_VALUES: Role[] = [
  'PATIENT',
  'DOCTOR',
  'CLINIC_ADMIN',
  'CLINIC_OPERATOR',
  'PLATFORM_SUPPORT',
  'PLATFORM_FINANCE',
  'PLATFORM_SUPER_ADMIN',
  'MIS_SERVICE',
  'AUDITOR',
];

export class CreateUserBodyDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(8) password?: string;
  @ApiProperty() @IsString() @Length(1, 128) firstName!: string;
  @ApiProperty() @IsString() @Length(1, 128) lastName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty({ enum: ROLE_VALUES }) @IsIn(ROLE_VALUES) role!: Role;
  @ApiPropertyOptional() @IsOptional() @IsUUID() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  // Doctor extras (used only when role === 'DOCTOR')
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() licenseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) yearsOfExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() basePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) defaultDurationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: ROLE_VALUES }) @IsOptional() @IsIn(ROLE_VALUES) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['ACTIVE', 'PENDING', 'BLOCKED']) status?:
    | 'ACTIVE'
    | 'PENDING'
    | 'BLOCKED';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['mine', 'all']) scope?: 'mine' | 'all';
}

export class AddMembershipBodyDto {
  @ApiProperty() @IsUUID() tenantId!: string;
  @ApiProperty({ enum: ROLE_VALUES }) @IsIn(ROLE_VALUES) role!: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class SetUserStatusBodyDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] })
  @IsIn(['ACTIVE', 'BLOCKED'])
  status!: 'ACTIVE' | 'BLOCKED';
}
