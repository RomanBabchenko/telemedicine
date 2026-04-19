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
}
