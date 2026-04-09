import { VerificationStatus } from './enums';

export interface DoctorDto {
  id: string;
  firstName: string;
  lastName: string;
  specializations: string[];
  subspecializations: string[];
  licenseNumber: string;
  yearsOfExperience: number;
  languages: string[];
  bio: string | null;
  photoUrl: string | null;
  verificationStatus: VerificationStatus;
  rating: number | null;
  basePrice: number;
  defaultDurationMin: number;
  /** Whether the doctor is active (published) in the current tenant. */
  isPublished: boolean;
  tenantProfiles?: DoctorTenantProfileDto[];
}

export interface DoctorTenantProfileDto {
  tenantId: string;
  displayName: string | null;
  price: number;
  isPublished: boolean;
  slotSourceIsMis: boolean;
}

export interface DoctorSearchQuery {
  specialization?: string;
  language?: string;
  city?: string;
  tenantId?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

export interface UpdateDoctorDto {
  firstName?: string;
  lastName?: string;
  bio?: string;
  photoUrl?: string;
  specializations?: string[];
  subspecializations?: string[];
  languages?: string[];
  licenseNumber?: string | null;
  yearsOfExperience?: number;
  basePrice?: number;
  defaultDurationMin?: number;
}

export interface CreateDoctorDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specializations: string[];
  languages?: string[];
  licenseNumber?: string;
  yearsOfExperience?: number;
  bio?: string;
  photoUrl?: string;
  basePrice?: number;
  defaultDurationMin?: number;
}

export interface AvailabilityRuleDto {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  bufferMin: number;
  serviceTypeId: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface CreateAvailabilityRuleDto {
  weekday: number;
  startTime: string;
  endTime: string;
  bufferMin?: number;
  serviceTypeId?: string;
  validFrom?: string;
  validUntil?: string;
}
