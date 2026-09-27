import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { FEATURE_KEYS, RECORDING_NOTICE_MAX_LENGTH } from '@telemed/shared-types';
import type { UpdateTenantDto } from '@telemed/shared-types';

// Rejects unknown feature keys and non-boolean values — a typo'd key used to
// be silently persisted into featureMatrix and then read back as "disabled".
@ValidatorConstraint({ name: 'featureMatrix', async: false })
class IsFeatureMatrixConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    return Object.entries(value).every(
      ([k, v]) => (FEATURE_KEYS as string[]).includes(k) && typeof v === 'boolean',
    );
  }

  defaultMessage(): string {
    return `features may only contain boolean values for keys: ${FEATURE_KEYS.join(', ')}`;
  }
}

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

class TenantLoginPolicyInput {
  @ApiPropertyOptional({ description: 'Allow full login for DOCTOR role (default true)' })
  @IsOptional()
  @IsBoolean()
  doctorEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Allow full login for PATIENT role (default true)' })
  @IsOptional()
  @IsBoolean()
  patientEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Accept login only from the clinic subdomain (<sub>.admin/doctor/patient.<apex>); default false — bare app hosts also work',
  })
  @IsOptional()
  @IsBoolean()
  requireSubdomain?: boolean;
}

class TenantConsultationPolicyInput {
  @ApiPropertyOptional({ description: 'Show the recording notice before joining (default true)' })
  @IsOptional()
  @IsBoolean()
  recordingNoticeEnabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: RECORDING_NOTICE_MAX_LENGTH,
    description: 'Custom consent sentence; null restores the default',
  })
  @IsOptional()
  @IsString()
  @MaxLength(RECORDING_NOTICE_MAX_LENGTH)
  recordingNoticeText?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://clinic.example/oferta',
    description: 'Public offer agreement URL; null falls back to websiteUrl',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(512)
  offerUrl?: string | null;
}

export class UpdateTenantBodyDto implements UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional({ example: '#2563EB' })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  // Branding field (INTEGRATION_ADMIN may set it too). null clears.
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://clinic.example',
    description: 'Clinic website for the patient post-call «Повернутися на сайт клініки» button',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(512)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ type: Object, description: 'Partial feature matrix overrides' })
  @IsOptional()
  @Validate(IsFeatureMatrixConstraint)
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

  @ApiPropertyOptional({ type: TenantLoginPolicyInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantLoginPolicyInput)
  loginPolicy?: TenantLoginPolicyInput;

  @ApiPropertyOptional({ type: TenantConsultationPolicyInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantConsultationPolicyInput)
  consultationPolicy?: TenantConsultationPolicyInput;
}
