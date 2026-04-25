import { Tenant } from '../../domain/entities/tenant.entity';
import {
  TenantAudioPolicyResponseDto,
  TenantResponseDto,
} from '../dto/tenant.response.dto';

const toAudioPolicy = (
  policy: Tenant['audioPolicy'],
): TenantAudioPolicyResponseDto => ({
  enabled: policy?.enabled ?? false,
  retentionDays: policy?.retentionDays ?? 30,
  consentRequired: policy?.consentRequired ?? true,
});

export const toTenantResponse = (t: Tenant): TenantResponseDto => ({
  id: t.id,
  slug: t.slug,
  brandName: t.brandName,
  subdomain: t.subdomain,
  primaryColor: t.primaryColor,
  logoUrl: t.logoUrl,
  locale: t.locale,
  currency: t.currency,
  features: t.featureMatrix,
  audioPolicy: toAudioPolicy(t.audioPolicy),
  invitePolicy: t.invitePolicy ?? {},
});
