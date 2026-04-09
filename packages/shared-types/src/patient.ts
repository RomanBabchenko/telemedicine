import { ConsentStatus, ConsentType } from './enums';

export interface PatientDto {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  preferredLocale: string;
}

export interface UpdatePatientDto {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  preferredLocale?: string;
}

export interface ConsentDto {
  id: string;
  type: ConsentType;
  status: ConsentStatus;
  versionCode: string;
  grantedAt: string;
  withdrawnAt: string | null;
}

export interface GrantConsentDto {
  type: ConsentType;
  versionCode: string;
}
