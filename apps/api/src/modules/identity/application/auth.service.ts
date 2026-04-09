import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthResponseDto, Role } from '@telemed/shared-types';
import { AppConfig } from '../../../config/env.config';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { User } from '../domain/entities/user.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { OtpService } from './otp.service';
import { MagicLinkService } from './magic-link.service';
import { MfaService } from './mfa.service';
import { UserService } from './user.service';

interface AuditMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly magic: MagicLinkService,
    private readonly mfa: MfaService,
    private readonly userService: UserService,
    private readonly config: AppConfig,
    private readonly tenantContext: TenantContextService,
  ) {}

  async registerPatient(input: {
    email?: string;
    phone?: string;
    password: string;
    firstName: string;
    lastName: string;
    preferredLocale?: string;
  }, meta: AuditMeta = {}): Promise<AuthResponseDto> {
    if (!input.email && !input.phone) {
      throw new BadRequestException('Email or phone is required');
    }
    const existing = input.email
      ? await this.userService.findByEmail(input.email)
      : input.phone
      ? await this.userService.findByPhone(input.phone)
      : null;
    if (existing) throw new ConflictException('User already exists');

    const passwordHash = await this.passwords.hash(input.password);
    const user = this.users.create({
      email: input.email ?? null,
      phone: input.phone ?? null,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    await this.users.save(user);

    const patient = this.patients.create({
      userId: user.id,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      preferredLocale: input.preferredLocale ?? 'uk',
    });
    await this.patients.save(patient);

    // Use the tenant from the inbound request (X-Tenant-Id header or
    // subdomain) instead of hardcoding the platform tenant. The patient
    // app sends the clinic id, so this lands the new patient as a member
    // of that clinic — staying in sync with whatever tenant the SPA is
    // talking to. Falls back to platformTenantId only when nothing was
    // resolved (curl/Swagger without a header).
    const tenantId = this.tenantContext.getTenantId();
    await this.userService.ensureMembership(user.id, tenantId, Role.PATIENT, true);

    return this.buildAuthResponse(user, [Role.PATIENT], tenantId, meta);
  }

  async login(input: {
    email?: string;
    phone?: string;
    password: string;
    mfaCode?: string;
  }, meta: AuditMeta = {}): Promise<AuthResponseDto> {
    const user = input.email
      ? await this.userService.findByEmail(input.email)
      : input.phone
      ? await this.userService.findByPhone(input.phone)
      : null;
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account inactive');

    if (user.mfaEnabled && user.mfaSecret) {
      if (!input.mfaCode) throw new UnauthorizedException('MFA code required');
      if (!this.mfa.verify(user.mfaSecret, input.mfaCode)) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    const tenantId = await this.userService.getDefaultTenantId(user.id);
    const roles = await this.userService.getRoles(user.id, tenantId);
    return this.buildAuthResponse(user, roles, tenantId, meta);
  }

  async requestOtp(identifier: string, channel: 'EMAIL' | 'PHONE'): Promise<void> {
    await this.otp.issue(identifier, channel);
  }

  async verifyOtp(identifier: string, code: string, meta: AuditMeta = {}): Promise<AuthResponseDto> {
    const ok = await this.otp.verify(identifier, code);
    if (!ok) throw new UnauthorizedException('Invalid OTP');

    let user: User | null = await this.userService.findByEmail(identifier);
    if (!user) user = await this.userService.findByPhone(identifier);
    if (!user) {
      // Auto-create patient on first OTP login
      user = this.users.create({
        email: identifier.includes('@') ? identifier : null,
        phone: identifier.includes('@') ? null : identifier,
        firstName: 'Пацієнт',
        lastName: 'Новий',
        status: 'ACTIVE',
        mfaEnabled: false,
      });
      await this.users.save(user);
      const patient = this.patients.create({
        userId: user.id,
        firstName: 'Пацієнт',
        lastName: 'Новий',
        email: user.email,
        phone: user.phone,
        preferredLocale: 'uk',
      });
      await this.patients.save(patient);
      await this.userService.ensureMembership(
        user.id,
        this.tenantContext.getTenantId(),
        Role.PATIENT,
        true,
      );
    }
    if (identifier.includes('@')) {
      user.emailVerifiedAt = new Date();
    } else {
      user.phoneVerifiedAt = new Date();
    }
    await this.users.save(user);

    const tenantId = await this.userService.getDefaultTenantId(user.id);
    const roles = await this.userService.getRoles(user.id, tenantId);
    return this.buildAuthResponse(user, roles, tenantId, meta);
  }

  async requestMagicLink(email: string): Promise<void> {
    await this.magic.issue(email);
  }

  async consumeMagicLink(token: string, meta: AuditMeta = {}): Promise<AuthResponseDto> {
    const email = await this.magic.consume(token);
    if (!email) throw new UnauthorizedException('Invalid or expired magic link');
    let user = await this.userService.findByEmail(email);
    if (!user) {
      user = this.users.create({
        email,
        firstName: 'Пацієнт',
        lastName: 'Магік',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
      await this.users.save(user);
      const patient = this.patients.create({
        userId: user.id,
        firstName: 'Пацієнт',
        lastName: 'Магік',
        email,
        preferredLocale: 'uk',
      });
      await this.patients.save(patient);
      await this.userService.ensureMembership(
        user.id,
        this.tenantContext.getTenantId(),
        Role.PATIENT,
        true,
      );
    }
    const tenantId = await this.userService.getDefaultTenantId(user.id);
    const roles = await this.userService.getRoles(user.id, tenantId);
    return this.buildAuthResponse(user, roles, tenantId, meta);
  }

  async refresh(refreshToken: string, meta: AuditMeta = {}): Promise<AuthResponseDto> {
    const { session, payload } = await this.tokens.refresh(refreshToken);
    const user = await this.userService.getByIdOrThrow(payload.sub);
    await this.tokens.revoke(session.id);
    const tenantId = await this.userService.getDefaultTenantId(user.id);
    const roles = await this.userService.getRoles(user.id, tenantId);
    return this.buildAuthResponse(user, roles, tenantId, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const { session } = await this.tokens.refresh(refreshToken);
      await this.tokens.revoke(session.id);
    } catch {
      // ignore: idempotent logout
    }
  }

  async enrollMfa(userId: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const user = await this.userService.getByIdOrThrow(userId);
    const { secret, otpauthUrl } = this.mfa.generateSecret(user.email ?? user.phone ?? user.id);
    user.mfaSecret = secret;
    await this.users.save(user);
    const qrCodeDataUrl = await this.mfa.makeQrDataUrl(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async verifyMfaEnrollment(userId: string, code: string): Promise<void> {
    const user = await this.userService.getByIdOrThrow(userId);
    if (!user.mfaSecret) throw new BadRequestException('MFA not enrolled');
    if (!this.mfa.verify(user.mfaSecret, code)) {
      throw new BadRequestException('Invalid MFA code');
    }
    user.mfaEnabled = true;
    await this.users.save(user);
  }

  private async buildAuthResponse(
    user: User,
    roles: Role[],
    tenantId: string | null,
    meta: AuditMeta,
  ): Promise<AuthResponseDto> {
    const tokens = await this.tokens.issue(
      user,
      roles,
      tenantId,
      null,
      meta.ip,
      meta.userAgent,
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        tenantId,
        mfaEnabled: user.mfaEnabled,
      },
      tokens,
    };
  }
}
