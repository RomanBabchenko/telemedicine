import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import type { CreateTenantDto } from '@telemed/shared-types';

export class CreateTenantBodyDto implements CreateTenantDto {
  @ApiProperty({ description: 'URL-safe slug (a-z, 0-9, -)' })
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, digits and hyphens' })
  slug!: string;

  @ApiProperty({ description: 'Brand display name' })
  @IsString()
  @Length(2, 256)
  brandName!: string;

  @ApiProperty({ description: 'Public subdomain (first label of the hostname)' })
  @IsString()
  @Length(2, 128)
  @Matches(/^[a-z0-9-]+$/, { message: 'subdomain must be lowercase letters, digits and hyphens' })
  subdomain!: string;

  @ApiPropertyOptional({ description: 'Primary brand color (hex)', example: '#1f7ae0' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: 'UAH' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  billingPlanId?: string;
}
