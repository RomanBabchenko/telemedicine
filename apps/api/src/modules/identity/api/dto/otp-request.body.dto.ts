import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { OtpRequestDto } from '@telemed/shared-types';

export class OtpRequestBodyDto implements OtpRequestDto {
  @ApiPropertyOptional({ description: 'Email address (either email or phone is required)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number (either email or phone is required)' })
  @IsOptional()
  @IsString()
  phone?: string;
}
