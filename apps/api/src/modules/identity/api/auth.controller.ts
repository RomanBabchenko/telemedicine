import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public, CurrentUser, AuthUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable } from '../../../common/audit/decorators';
import { AuthService } from '../application/auth.service';
import {
  LoginBodyDto,
  MagicLinkConsumeBodyDto,
  MagicLinkRequestBodyDto,
  MfaVerifyBodyDto,
  OtpRequestBodyDto,
  OtpVerifyBodyDto,
  RefreshBodyDto,
  RegisterPatientBodyDto,
} from './dto';
import { UserService } from '../application/user.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
  ) {}

  private metaFrom(req: Request) {
    return { ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null };
  }

  @Post('register/patient')
  @Public()
  @Auditable({ action: 'auth.patient.registered', resource: 'User' })
  register(@Body() body: RegisterPatientBodyDto, @Req() req: Request) {
    return this.auth.registerPatient(body, this.metaFrom(req));
  }

  @Post('login')
  @Public()
  @Auditable({ action: 'auth.login', resource: 'User' })
  login(@Body() body: LoginBodyDto, @Req() req: Request) {
    return this.auth.login(body, this.metaFrom(req));
  }

  @Post('otp/request')
  @Public()
  async otpRequest(@Body() body: OtpRequestBodyDto) {
    if (!body.email && !body.phone) throw new BadRequestException('Email or phone required');
    await this.auth.requestOtp((body.email ?? body.phone)!, body.email ? 'EMAIL' : 'PHONE');
    return { ok: true };
  }

  @Post('otp/verify')
  @Public()
  @Auditable({ action: 'auth.otp.verified', resource: 'User' })
  otpVerify(@Body() body: OtpVerifyBodyDto, @Req() req: Request) {
    if (!body.email && !body.phone) throw new BadRequestException('Email or phone required');
    return this.auth.verifyOtp((body.email ?? body.phone)!, body.code, this.metaFrom(req));
  }

  @Post('magic-link/request')
  @Public()
  async magicLinkRequest(@Body() body: MagicLinkRequestBodyDto) {
    await this.auth.requestMagicLink(body.email);
    return { ok: true };
  }

  @Post('magic-link/consume')
  @Public()
  @Auditable({ action: 'auth.magic-link.consumed', resource: 'User' })
  magicLinkConsume(@Body() body: MagicLinkConsumeBodyDto, @Req() req: Request) {
    return this.auth.consumeMagicLink(body.token, this.metaFrom(req));
  }

  @Post('refresh')
  @Public()
  refresh(@Body() body: RefreshBodyDto, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, this.metaFrom(req));
  }

  @Post('logout')
  @Public()
  async logout(@Body() body: RefreshBodyDto) {
    await this.auth.logout(body.refreshToken);
    return { ok: true };
  }

  @Post('mfa/enroll')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'auth.mfa.enroll', resource: 'User' })
  enrollMfa(@CurrentUser() user: AuthUser) {
    return this.auth.enrollMfa(user.id);
  }

  @Post('mfa/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'auth.mfa.verified', resource: 'User' })
  async verifyMfa(@CurrentUser() user: AuthUser, @Body() body: MfaVerifyBodyDto) {
    await this.auth.verifyMfaEnrollment(user.id, body.code);
    return { ok: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.users.getByIdOrThrow(user.id);
    return {
      id: u.id,
      email: u.email,
      phone: u.phone,
      firstName: u.firstName,
      lastName: u.lastName,
      roles: user.roles,
      tenantId: user.tenantId,
      mfaEnabled: u.mfaEnabled,
    };
  }
}
