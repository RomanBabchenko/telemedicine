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
}

export interface TenantAudioPolicyDto {
  enabled: boolean;
  retentionDays: number;
  consentRequired: boolean;
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
}
