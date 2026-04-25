import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import type { UpdateTenantDto } from '@telemed/shared-types';

class TenantAudioPolicyInput {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentRequired?: boolean;
}

class TenantInvitePolicyInput {
  @ApiPropertyOptional({ description: 'Bind the invite-issued JWT to the caller IP' })
  @IsOptional()
  @IsBoolean()
  bindIp?: boolean;

  @ApiPropertyOptional({ description: 'Bind the invite-issued JWT to the caller User-Agent' })
  @IsOptional()
  @IsBoolean()
  bindUserAgent?: boolean;
}

export class UpdateTenantBodyDto implements UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional({ example: '#1f7ae0' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ type: Object, description: 'Partial feature matrix overrides' })
  @IsOptional()
  features?: Record<string, boolean>;

  @ApiPropertyOptional({ type: TenantAudioPolicyInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantAudioPolicyInput)
  audioPolicy?: TenantAudioPolicyInput;

  @ApiPropertyOptional({ type: TenantInvitePolicyInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantInvitePolicyInput)
  invitePolicy?: TenantInvitePolicyInput;
}
