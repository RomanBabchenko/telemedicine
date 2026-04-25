import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import type { OtpVerifyDto } from '@telemed/shared-types';

export class OtpVerifyBodyDto implements OtpVerifyDto {
  @ApiPropertyOptional({ description: 'Email address (either email or phone is required)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number (either email or phone is required)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ minLength: 4, maxLength: 10, description: 'One-time password code' })
  @IsString()
  @Length(4, 10)
  code!: string;
}
