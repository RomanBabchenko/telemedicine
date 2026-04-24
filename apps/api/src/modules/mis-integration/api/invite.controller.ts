import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { Request } from 'express';
import { Role } from '@telemed/shared-types';
import { Public } from '../../../common/auth/decorators';
import { ConsultationInviteService } from '../application/consultation-invite.service';
import { UserService } from '../../identity/application/user.service';
import { TokenService } from '../../identity/application/token.service';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { TenantService } from '../../tenant/application/tenant.service';

// Match INVITE_EXPIRY_GRACE_MS in consultation-invite.service.ts — the JWT
// minted from an invite expires at the same moment the invite itself does.
const INVITE_JWT_GRACE_MS = 30 * 60 * 1000;

// Truncated sha256 — enough entropy to detect UA change, short enough to
// keep the JWT compact. Full hash is overkill; we're not authenticating
// the UA, we're detecting substitution.
const hashUa = (ua: string | undefined): string | undefined => {
  if (!ua) return undefined;
  return createHash('sha256').update(ua).digest('hex').slice(0, 16);
};

const resolveClientIp = (req: Request): string | undefined => {
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? undefined;
};

@ApiTags('auth')
@Controller('auth/invite')
export class InviteController {
  constructor(
    private readonly invites: ConsultationInviteService,
    private readonly users: UserService,
    private readonly tokens: TokenService,
    private readonly tenants: TenantService,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
  ) {}

  @Post('consume')
  @Public()
  async consume(
    @Body() body: { token: string },
    @Req() req: Request,
  ) {
    const result = await this.invites.consume(body.token);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired invite link');
    }

    const inviteCtx = {
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };

    // Cap the JWT lifetime at the appointment end so a leaked token can't be
    // reused after the consultation is over. Same rule for both named and
    // anonymous invites.
    const appt = await this.appointments.findOne({
      where: { id: result.appointmentId, tenantId: result.tenantId },
    });
    const accessTtlOverrideSec = appt
      ? Math.max(
          60,
          Math.ceil(
            (appt.endAt.getTime() + INVITE_JWT_GRACE_MS - Date.now()) / 1000,
          ),
        )
      : undefined;

    // Per-tenant opt-in session bindings. Off by default; when on, the JWT
    // is pinned to the IP / UA-hash captured at consume time and the guard
    // rejects mismatches on subsequent requests.
    const tenant = result.tenantId
      ? await this.tenants.findById(result.tenantId)
      : null;
    const policy = tenant?.invitePolicy ?? {};
    const boundIp = policy.bindIp ? resolveClientIp(req) : undefined;
    const boundUaHash = policy.bindUserAgent
      ? hashUa(req.headers['user-agent'] as string | undefined)
      : undefined;

    // Anonymous-patient branch: no User / Patient row exists. Issue a
    // stateless JWT with scope='invite-anon', sub=null, and the invite row
    // id as the correlation pseudonym.
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
          scope: 'invite-anon' as const,
          inviteCtx,
        },
        tokens: issuedTokens,
        appointmentId: result.appointmentId,
        consultationSessionId: result.consultationSessionId,
      };
    }

    // Named invite (existing flow): resolve the User + roles and mint a
    // scope='invite' JWT tied to that user.
    // result.userId is guaranteed non-null here because isAnonymous===false.
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
      req.ip,
      req.headers['user-agent'] as string | undefined,
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
        scope: 'invite' as const,
        inviteCtx,
      },
      tokens: issuedTokens,
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };
  }
}
