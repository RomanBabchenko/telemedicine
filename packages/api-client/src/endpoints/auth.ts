import type {
  AuthResponseDto,
  AuthTokensDto,
  AuthUserDto,
  LoginDto,
  MagicLinkConsumeDto,
  MagicLinkRequestDto,
  MfaEnrollResponseDto,
  MfaVerifyDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshDto,
  RegisterDoctorDto,
  RegisterPatientDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const authApi = (client: ApiClient) => ({
  registerPatient: (dto: RegisterPatientDto) =>
    client.post<AuthResponseDto>('/auth/register/patient', dto),
  registerDoctor: (dto: RegisterDoctorDto) =>
    client.post<AuthResponseDto>('/auth/register/doctor', dto),
  login: (dto: LoginDto) => client.post<AuthResponseDto>('/auth/login', dto),
  otpRequest: (dto: OtpRequestDto) => client.post<{ ok: true }>('/auth/otp/request', dto),
  otpVerify: (dto: OtpVerifyDto) => client.post<AuthResponseDto>('/auth/otp/verify', dto),
  magicLinkRequest: (dto: MagicLinkRequestDto) =>
    client.post<{ ok: true }>('/auth/magic-link/request', dto),
  magicLinkConsume: (dto: MagicLinkConsumeDto) =>
    client.post<AuthResponseDto>('/auth/magic-link/consume', dto),
  mfaEnroll: () => client.post<MfaEnrollResponseDto>('/auth/mfa/enroll'),
  mfaVerify: (dto: MfaVerifyDto) => client.post<{ ok: true }>('/auth/mfa/verify', dto),
  refresh: (dto: RefreshDto) => client.post<AuthTokensDto>('/auth/refresh', dto),
  logout: () => client.post<{ ok: true }>('/auth/logout'),
  me: () => client.get<AuthUserDto>('/auth/me'),
  consumeInvite: (dto: { token: string }) =>
    client.post<AuthResponseDto & { appointmentId: string; consultationSessionId: string }>(
      '/auth/invite/consume',
      dto,
    ),
});
