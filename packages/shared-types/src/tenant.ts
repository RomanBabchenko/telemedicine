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
