import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';
import type { RegisterPatientDto } from '@telemed/shared-types';

export class RegisterPatientBodyDto implements RegisterPatientDto {
  @ApiPropertyOptional({ description: 'Email address (either email or phone is required)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number in E.164 format (either email or phone is required)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ minLength: 8, description: 'Account password' })
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

  @ApiPropertyOptional({ example: 'uk', description: 'Preferred UI locale (defaults to "uk")' })
  @IsOptional()
  @IsString()
  preferredLocale?: string;
}
