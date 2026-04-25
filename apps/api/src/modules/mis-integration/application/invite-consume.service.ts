import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { Role } from '@telemed/shared-types';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { UserService } from '../../identity/application/user.service';
import { TokenService } from '../../identity/application/token.service';
import { TenantService } from '../../tenant/application/tenant.service';
import { InviteConsumeResponseDto } from '../api/dto/invite-consume.response.dto';
import { ConsultationInviteService } from './consultation-invite.service';

// Match INVITE_EXPIRY_GRACE_MS in consultation-invite.service.ts — the JWT
// minted from an invite expires at the same moment the invite itself does.
const INVITE_JWT_GRACE_MS = 30 * 60 * 1000;

// Truncated sha256 — enough entropy to detect UA change, short enough to
// keep the JWT compact. We are not authenticating the UA, just detecting
// substitution.
const hashUa = (ua: string | undefined): string | undefined =>
  ua ? createHash('sha256').update(ua).digest('hex').slice(0, 16) : undefined;

/**
 * Request context the controller forwards to the service. Kept as plain data
 * so the service has no Express dependency.
 */
export interface InviteConsumeContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

@Injectable()
export class InviteConsumeService {
  constructor(
    private readonly invites: ConsultationInviteService,
    private readonly users: UserService,
    private readonly tokens: TokenService,
    private readonly tenants: TenantService,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
  ) {}

  /**
   * Exchange a single-use invite token for an invite-scoped session.
   *
   * Mints a JWT with scope='invite' for named invites or 'invite-anon' for
   * anonymous patients. Lifetime is capped at the appointment end + grace
   * window, and — per tenant invite policy — optionally pinned to the
   * caller's IP and/or User-Agent hash.
   */
  async consume(token: string, ctx: InviteConsumeContext): Promise<InviteConsumeResponseDto> {
    const result = await this.invites.consume(token);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired invite link');
    }

    const inviteCtx = {
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };

    // Cap the JWT lifetime at the appointment end so a leaked token can't be
    // reused after the consultation is over.
    const appt = await this.appointments.findOne({
      where: { id: result.appointmentId, tenantId: result.tenantId },
    });
    const accessTtlOverrideSec = appt
      ? Math.max(
          60,
          Math.ceil((appt.endAt.getTime() + INVITE_JWT_GRACE_MS - Date.now()) / 1000),
        )
      : undefined;

    // Per-tenant opt-in session bindings. When on, the JWT is pinned to the
    // IP / UA-hash captured at consume time; the guard rejects mismatches
    // on subsequent requests.
    const tenant = result.tenantId ? await this.tenants.findById(result.tenantId) : null;
    const policy = tenant?.invitePolicy ?? {};
    const boundIp = policy.bindIp ? ctx.ip : undefined;
    const boundUaHash = policy.bindUserAgent ? hashUa(ctx.userAgent) : undefined;

    // Anonymous-patient branch: no User/Patient row exists. Issue a stateless
    // JWT with scope='invite-anon', sub=null, and the invite row id as the
    // correlation pseudonym.
    if (result.isAnonymous) {
      const issuedTokens = await this.tokens.issueAnonymousInvite({
        tenantId: result.tenantId,
        inviteCtx,
        anonIdentity: result.inviteId,
        accessTtlOverrideSec,
        boundIp,
        boundUaHash,
      });
      return {
        user: {
          id: null,
          email: null,
          phone: null,
          firstName: null,
          lastName: null,
          roles: [Role.PATIENT],
          tenantId: result.tenantId,
          mfaEnabled: false,
          scope: 'invite-anon',
          inviteCtx,
        },
        tokens: issuedTokens,
        appointmentId: result.appointmentId,
        consultationSessionId: result.consultationSessionId,
      };
    }

    // Named invite: resolve the User + roles and mint a scope='invite' JWT
    // tied to that user. result.userId is guaranteed non-null here.
    const userId = result.userId!;
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const roles = await this.users.getRoles(userId, result.tenantId);

    const issuedTokens = await this.tokens.issue(
      user,
      roles,
      result.tenantId,
      null,
      ctx.ip ?? null,
      ctx.userAgent,
      {
        scope: 'invite',
        inviteCtx,
        accessTtlOverrideSec,
        skipRefresh: true,
        boundIp,
        boundUaHash,
      },
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        tenantId: result.tenantId,
        mfaEnabled: user.mfaEnabled,
        scope: 'invite',
        inviteCtx,
      },
      tokens: issuedTokens,
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };
  }
}
