import { Tenant } from '../../domain/entities/tenant.entity';
import {
  TenantAudioPolicyResponseDto,
  TenantConsultationPolicyResponseDto,
  TenantResponseDto,
} from '../dto/tenant.response.dto';

const toAudioPolicy = (
  policy: Tenant['audioPolicy'],
): TenantAudioPolicyResponseDto => ({
  enabled: policy?.enabled ?? false,
  retentionDays: policy?.retentionDays ?? 30,
  consentRequired: policy?.consentRequired ?? true,
});

export const toConsultationPolicy = (
  policy: Tenant['consultationPolicy'],
): TenantConsultationPolicyResponseDto => ({
  recordingNoticeEnabled: policy?.recordingNoticeEnabled ?? true,
  recordingNoticeText: policy?.recordingNoticeText ?? null,
  offerUrl: policy?.offerUrl ?? null,
});

export const toTenantResponse = (t: Tenant): TenantResponseDto => ({
  id: t.id,
  slug: t.slug,
  brandName: t.brandName,
  subdomain: t.subdomain,
  primaryColor: t.primaryColor,
  logoUrl: t.logoUrl,
  websiteUrl: t.websiteUrl ?? null,
  locale: t.locale,
  currency: t.currency,
  features: t.featureMatrix,
  audioPolicy: toAudioPolicy(t.audioPolicy),
  invitePolicy: t.invitePolicy ?? {},
  loginPolicy: t.loginPolicy ?? {},
  consultationPolicy: toConsultationPolicy(t.consultationPolicy),
});
