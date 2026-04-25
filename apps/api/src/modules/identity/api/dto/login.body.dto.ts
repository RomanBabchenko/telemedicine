import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { LoginDto } from '@telemed/shared-types';

export class LoginBodyDto implements LoginDto {
  @ApiPropertyOptional({ description: 'Email address (either email or phone is required)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number (either email or phone is required)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ description: '6-digit TOTP code when MFA is enabled on the account' })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}
