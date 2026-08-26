import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthUser, CurrentUser, Public } from '../../../common/auth/decorators';
import { Auditable } from '../../../common/audit/decorators';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import {
  ApiAuth,
  ApiAuthErrors,
  ApiStandardErrors,
} from '../../../common/swagger';
import { AppConfig } from '../../../config/env.config';
import { AuthService } from '../application/auth.service';
import { UserService } from '../application/user.service';
import {
  AuthConfigResponseDto,
  AuthResponseDto,
  LoginBodyDto,
  MagicLinkConsumeBodyDto,
  MagicLinkRequestBodyDto,
  MeResponseDto,
  MfaEnrollResponseDto,
  MfaVerifyBodyDto,
  OtpRequestBodyDto,
  OtpVerifyBodyDto,
  RefreshBodyDto,
  RegisterPatientBodyDto,
} from './dto';
import { toMeResponse } from './mappers/user.mapper';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
    private readonly config: AppConfig,
  ) {}

  private metaFrom(req: Request) {
    return {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
      origin: req.header('origin') ?? req.header('referer') ?? null,
    };
  }

  @Get('config')
  @Public()
  @ApiOperation({
    summary: 'Public auth configuration (login kill switches)',
    description:
      "Returns the platform-wide login flags (env vars AUTH_DISABLE_LOGIN_DOCTOR / AUTH_DISABLE_LOGIN_PATIENT). SPAs poll this on the login screen so they can render a 'use your invite link' notice instead of a form when full login is disabled. Per-tenant policy is NOT surfaced here — the patient app may not have a tenant context pre-auth.",
    operationId: 'getAuthConfig',
  })
  @ApiOkResponse({ type: AuthConfigResponseDto })
  authConfig(): AuthConfigResponseDto {
    return {
      doctorLoginEnabled: !this.config.auth.disableLoginDoctor,
      patientLoginEnabled: !this.config.auth.disableLoginPatient,
    };
  }

  @Post('register/patient')
  @Public()
  // Slow registration spam — a real new patient signs up once, not five
  // times a minute. NAT'd clinics shouldn't hit this from many users so
  // 5/min/IP is safe. Counts against ALL register attempts (including
  // failed ones) to prevent enumeration.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Auditable({ action: 'auth.patient.registered', resource: 'User' })
  @ApiOperation({
    summary: 'Register a new patient account',
    description:
      'Creates a User + Patient pair and enrols the user as a PATIENT in the resolved tenant (X-Tenant-Id header or platform tenant). Returns the access + refresh tokens so the SPA can proceed straight to login.',
    operationId: 'registerPatient',
  })
  @ApiBody({ type: RegisterPatientBodyDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiAuthErrors()
  register(
    @Body() body: RegisterPatientBodyDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.registerPatient(body, this.metaFrom(req));
  }

  @Post('login')
  @Public()
  // Brute-force shield: a human typing a password retries a handful of
  // times, never tens. 10/min/IP allows for typo correction without
  // letting an attacker iterate through password lists. Even at 10/min
  // a 10k-password dictionary needs 16 hours per account.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'auth.login', resource: 'User' })
  @ApiOperation({
    summary: 'Authenticate with email/phone and password',
    description:
      'Supports username+password authentication with optional 6-digit TOTP code when the account has MFA enabled.',
    operationId: 'login',
  })
  @ApiBody({ type: LoginBodyDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiAuthErrors()
  login(
    @Body() body: LoginBodyDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.login(body, this.metaFrom(req));
  }

  @Post('otp/request')
  @Public()
  // OTP requests cost real money (SMS) and can spam inboxes. 5/min/IP
  // is plenty for a user fixing a typo once or twice.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a one-time password',
    description: 'Sends an OTP to the supplied email or phone. At least one contact field is required.',
    operationId: 'requestOtp',
  })
  @ApiBody({ type: OtpRequestBodyDto })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiAuthErrors()
  async otpRequest(@Body() body: OtpRequestBodyDto): Promise<OkResponseDto> {
    if (!body.email && !body.phone) throw new BadRequestException('Email or phone required');
    await this.auth.requestOtp((body.email ?? body.phone)!, body.email ? 'EMAIL' : 'PHONE');
    return OkResponseDto.value;
  }

  @Post('otp/verify')
  @Public()
  // OTP brute-force shield. 6-digit codes have a 1/1M guess chance, but
  // with no rate limit an attacker can drain that in seconds. 10/min/IP
  // is permissive for typo retries while making blind guessing useless.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'auth.otp.verified', resource: 'User' })
  @ApiOperation({
    summary: 'Verify an OTP and obtain an auth session',
    description:
      'Consumes a previously issued OTP. If the identifier has no User yet, a fresh patient account is auto-created.',
    operationId: 'verifyOtp',
  })
  @ApiBody({ type: OtpVerifyBodyDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiAuthErrors()
  otpVerify(
    @Body() body: OtpVerifyBodyDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    if (!body.email && !body.phone) throw new BadRequestException('Email or phone required');
    return this.auth.verifyOtp((body.email ?? body.phone)!, body.code, this.metaFrom(req));
  }

  @Post('magic-link/request')
  @Public()
  // Same reasoning as OTP request — magic links go out via email and
  // shouldn't be requested in bulk.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a magic-link email',
    operationId: 'requestMagicLink',
  })
  @ApiBody({ type: MagicLinkRequestBodyDto })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiAuthErrors()
  async magicLinkRequest(@Body() body: MagicLinkRequestBodyDto): Promise<OkResponseDto> {
    await this.auth.requestMagicLink(body.email);
    return OkResponseDto.value;
  }

  @Post('magic-link/consume')
  @Public()
  // Magic-link tokens are long random strings, but bound the attempt
  // rate anyway as defence-in-depth against token-guessing.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'auth.magic-link.consumed', resource: 'User' })
  @ApiOperation({
    summary: 'Exchange a magic-link token for an auth session',
    operationId: 'consumeMagicLink',
  })
  @ApiBody({ type: MagicLinkConsumeBodyDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiAuthErrors()
  magicLinkConsume(
    @Body() body: MagicLinkConsumeBodyDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.consumeMagicLink(body.token, this.metaFrom(req));
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh an access token',
    description: 'Rotates the refresh token: the old one is revoked, a new access/refresh pair is issued.',
    operationId: 'refresh',
  })
  @ApiBody({ type: RefreshBodyDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiAuthErrors()
  refresh(
    @Body() body: RefreshBodyDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(body.refreshToken, this.metaFrom(req));
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a refresh token',
    description: 'Idempotent: replaying an already-revoked token returns 200 with {ok:true}.',
    operationId: 'logout',
  })
  @ApiBody({ type: RefreshBodyDto })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiAuthErrors()
  async logout(@Body() body: RefreshBodyDto): Promise<OkResponseDto> {
    await this.auth.logout(body.refreshToken);
    return OkResponseDto.value;
  }

  @Post('mfa/enroll')
  @Auditable({ action: 'auth.mfa.enroll', resource: 'User' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Begin MFA enrolment',
    description: 'Generates a fresh TOTP secret and QR code. The user must confirm with POST /auth/mfa/verify before MFA becomes mandatory on login.',
    operationId: 'enrollMfa',
  })
  @ApiOkResponse({ type: MfaEnrollResponseDto })
  @ApiStandardErrors()
  enrollMfa(@CurrentUser() user: AuthUser): Promise<MfaEnrollResponseDto> {
    return this.auth.enrollMfa(user.id);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'auth.mfa.verified', resource: 'User' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Finalise MFA enrolment',
    description: 'Verifies the first TOTP code and flips the account to mfaEnabled=true.',
    operationId: 'verifyMfa',
  })
  @ApiBody({ type: MfaVerifyBodyDto })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  async verifyMfa(
    @CurrentUser() user: AuthUser,
    @Body() body: MfaVerifyBodyDto,
  ): Promise<OkResponseDto> {
    await this.auth.verifyMfaEnrollment(user.id, body.code);
    return OkResponseDto.value;
  }

  @Get('me')
  @ApiAuth()
  @ApiOperation({
    summary: 'Return the current authenticated user',
    operationId: 'getMe',
  })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiStandardErrors()
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    const u = await this.users.getByIdOrThrow(user.id);
    return toMeResponse(u, user.roles, user.tenantId);
  }
}
