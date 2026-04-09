import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdateTenantBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() brandName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() primaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() features?: Record<string, boolean>;
  @ApiPropertyOptional() @IsOptional() @IsObject() audioPolicy?: {
    enabled?: boolean;
    retentionDays?: number;
    consentRequired?: boolean;
  };
}

export class CreateTenantBodyDto {
  @ApiProperty() @IsString() @Length(2, 64) slug!: string;
  @ApiProperty() @IsString() @Length(2, 128) subdomain!: string;
  @ApiProperty() @IsString() @Length(2, 256) brandName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() primaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() billingPlanId?: string;
}
