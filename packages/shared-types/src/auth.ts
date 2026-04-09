import { Role } from './enums';

export interface RegisterPatientDto {
  email?: string;
  phone?: string;
  password: string;
  firstName: string;
  lastName: string;
  preferredLocale?: string;
}

export interface RegisterDoctorDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specializations: string[];
  licenseNumber: string;
  yearsOfExperience: number;
  languages: string[];
}

export interface LoginDto {
  email?: string;
  phone?: string;
  password: string;
  mfaCode?: string;
}

export interface OtpRequestDto {
  phone?: string;
  email?: string;
}

export interface OtpVerifyDto {
  phone?: string;
  email?: string;
  code: string;
}

export interface MagicLinkRequestDto {
  email: string;
}

export interface MagicLinkConsumeDto {
  token: string;
}

export interface RefreshDto {
  refreshToken: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUserDto {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: Role[];
  tenantId: string | null;
  mfaEnabled: boolean;
}

export interface AuthResponseDto {
  user: AuthUserDto;
  tokens: AuthTokensDto;
}

export interface MfaEnrollResponseDto {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaVerifyDto {
  code: string;
}
