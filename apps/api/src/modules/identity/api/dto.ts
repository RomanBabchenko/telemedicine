import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

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
