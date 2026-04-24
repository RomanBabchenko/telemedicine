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
  // null when the session was opened via an invite link — invite holders
  // re-authenticate by consuming the same invite URL again rather than
  // refreshing a long-lived token.
  refreshToken: string | null;
  expiresIn: number;
}

export interface InviteContextDto {
  appointmentId: string;
  consultationSessionId: string;
}

export interface AuthUserDto {
  // null only for scope === 'invite-anon' — anonymous-patient invites have
  // no User / Patient row on the server side.
  id: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: Role[];
  tenantId: string | null;
  mfaEnabled: boolean;
  // 'invite'      — named invite link, restricted to waiting room + video.
  // 'invite-anon' — anonymous-patient invite; no PII, no User row.
  // Both scopes share the same route-level restrictions on the client.
  scope?: 'full' | 'invite' | 'invite-anon';
  inviteCtx?: InviteContextDto;
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

// ─────────────────────────────────────────────────────────────────────────────
// Admin user/membership management
// ─────────────────────────────────────────────────────────────────────────────

export type UserStatus = 'ACTIVE' | 'PENDING' | 'BLOCKED';

export interface UserSummaryDto {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface MembershipDto {
  id: string;
  userId: string;
  tenantId: string;
  /** Joined for convenience in admin UI; null when tenant lookup failed. */
  tenantName: string | null;
  role: Role;
  isDefault: boolean;
  createdAt: string;
}

export interface UserDetailDto extends UserSummaryDto {
  memberships: MembershipDto[];
}

export interface ListUsersQuery {
  role?: Role;
  search?: string;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
  /** PLATFORM_SUPER_ADMIN only — `all` returns users across every tenant. */
  scope?: 'mine' | 'all';
}

export interface CreateUserDto {
  email: string;
  /** If omitted, the server generates a temporary one and returns it. */
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  /** Only PLATFORM_SUPER_ADMIN can pass a foreign tenant; CLINIC_ADMIN value is ignored. */
  tenantId?: string;
  isDefault?: boolean;
  // Doctor-specific extras (used only when role === DOCTOR)
  specializations?: string[];
  languages?: string[];
  licenseNumber?: string;
  yearsOfExperience?: number;
  basePrice?: number;
  defaultDurationMin?: number;
  bio?: string;
}

export interface AddMembershipDto {
  tenantId: string;
  role: Role;
  isDefault?: boolean;
}

export interface ResetPasswordResponseDto {
  temporaryPassword: string;
}

export interface UserLookupResponseDto {
  exists: boolean;
  user?: UserSummaryDto;
}
