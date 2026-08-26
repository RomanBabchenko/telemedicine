export interface TenantBrandingDto {
  brandName: string;
  primaryColor: string;
  logoUrl: string | null;
}

export interface TenantFeatureMatrix {
  b2cListing: boolean;
  bookingWidget: boolean;
  embeddedConsultation: boolean;
  prescriptionModule: boolean;
  analyticsPackage: boolean;
  brandedPatientPortal: boolean;
  misSync: boolean;
  advancedReports: boolean;
  audioArchive: boolean;
  apiAccess: boolean;
}

export type TenantFeatureKey = keyof TenantFeatureMatrix;

// Canonical defaults — the single source of truth used by the API's
// FeatureGuard fallback, TenantService.create and the seeds. A tenant whose
// featureMatrix misses a key behaves per this map instead of "everything off".
export const DEFAULT_FEATURE_MATRIX: TenantFeatureMatrix = {
  b2cListing: false,
  bookingWidget: true,
  embeddedConsultation: true,
  prescriptionModule: true,
  analyticsPackage: true,
  brandedPatientPortal: true,
  misSync: false,
  advancedReports: false,
  audioArchive: false,
  apiAccess: false,
};

export const FEATURE_KEYS = Object.keys(DEFAULT_FEATURE_MATRIX) as TenantFeatureKey[];

// Shared admin-UI labels (previously two hand-maintained copies in web-admin).
export const FEATURE_LABELS: Record<TenantFeatureKey, string> = {
  b2cListing: 'B2C каталог лікарів',
  bookingWidget: 'Віджет бронювання',
  embeddedConsultation: 'Вбудовані відеоконсультації',
  prescriptionModule: 'Модуль рецептів',
  analyticsPackage: 'Аналітика',
  brandedPatientPortal: 'Брендований портал пацієнта',
  misSync: 'Синхронізація з МІС',
  advancedReports: 'Розширені звіти',
  audioArchive: 'Аудіоархів консультацій',
  apiAccess: 'API-доступ (інтеграційні ключі)',
};

export interface TenantDto {
  id: string;
  slug: string;
  brandName: string;
  subdomain: string;
  primaryColor: string;
  logoUrl: string | null;
  locale: string;
  currency: string;
  features: TenantFeatureMatrix;
  audioPolicy: TenantAudioPolicyDto;
  invitePolicy: TenantInvitePolicyDto;
  loginPolicy: TenantLoginPolicyDto;
}

export interface TenantAudioPolicyDto {
  enabled: boolean;
  retentionDays: number;
  consentRequired: boolean;
}

// Security policy for invite-link sessions. Off by default — toggle on to
// pin the issued JWT to the IP and/or User-Agent of the consuming device.
// Patients hitting a mismatch have to re-click the invite link.
export interface TenantInvitePolicyDto {
  bindIp?: boolean;
  bindUserAgent?: boolean;
}

// Per-tenant gate on *full* login (email+password / OTP / magic-link /
// patient self-register). Missing or `true` = enabled — only explicit
// `false` blocks the matching role from logging in. Invite-link
// consumption (POST /auth/invite/consume) is unaffected; admin/internal
// roles always bypass the gate.
export interface TenantLoginPolicyDto {
  doctorEnabled?: boolean;
  patientEnabled?: boolean;
  /**
   * When true, password/OTP login into this tenant is accepted only from
   * the clinic's own subdomain (<subdomain>.admin/doctor/patient.<apex>),
   * not from the bare app hosts. Missing/false = either entry point works.
   * Platform-level roles are exempt so operators can't lock themselves out.
   */
  requireSubdomain?: boolean;
}

export interface CreateTenantDto {
  slug: string;
  brandName: string;
  subdomain: string;
  primaryColor?: string;
  logoUrl?: string | null;
  locale?: string;
  currency?: string;
  billingPlanId?: string | null;
}

export interface UpdateTenantDto {
  brandName?: string;
  primaryColor?: string;
  logoUrl?: string | null;
  locale?: string;
  features?: Partial<TenantFeatureMatrix>;
  audioPolicy?: Partial<TenantAudioPolicyDto>;
  invitePolicy?: Partial<TenantInvitePolicyDto>;
  loginPolicy?: Partial<TenantLoginPolicyDto>;
}
