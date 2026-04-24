import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { Role } from '@telemed/shared-types';
import { AppConfig } from '../../../config/env.config';
import { Session } from '../domain/entities/session.entity';
import { User } from '../domain/entities/user.entity';

export interface InviteContext {
  appointmentId: string;
  consultationSessionId: string;
}

export interface AccessTokenPayload {
  // null only for anonymous-patient invites (scope === 'invite-anon') where
  // there is no User row. Guards substitute `anonIdentity` as a correlation
  // handle so downstream code can keep reading user.id opaquely.
  sub: string | null;
  email: string | null;
  phone: string | null;
  roles: Role[];
  tenantId: string | null;
  mfaEnabled: boolean;
  // scope === 'invite' means the token was issued from a named invite link
  // and grants access only to the waiting room + video session identified by
  // inviteCtx. scope === 'invite-anon' is the same, but for anonymous-patient
  // invites where the MIS did not share PII and no User row exists. Default
  // (absent or 'full') is normal unrestricted access.
  scope?: 'full' | 'invite' | 'invite-anon';
  inviteCtx?: InviteContext;
  // Stable pseudonym for anonymous-invite tokens — set to the ConsultationInvite
  // row id. Lets LiveKit identity + audit trail stay consistent across
  // multiple consumes of the same link, and change on revoke+reissue.
  anonIdentity?: string;
  // Optional per-tenant session bindings for invite-scoped tokens. When
  // set, JwtAuthGuard rejects the request if the current IP / UA-hash
  // does not match. Absent claims disable the check for that dimension.
  boundIp?: string;
  boundUaHash?: string;
}

export interface IssuedTokens {
  accessToken: string;
  // null when the caller passed skipRefresh (invite-scoped sessions don't
  // get a refresh token — the invite link itself is the re-auth mechanism).
  refreshToken: string | null;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseTtlSeconds(ttl: string): number {
    const m = ttl.match(/^(\d+)([smhdw])$/);
    if (!m) return Number.parseInt(ttl, 10) || 900;
    const [, value, unit] = m;
    const n = Number.parseInt(value as string, 10);
    switch (unit) {
      case 's': return n;
      case 'm': return n * 60;
      case 'h': return n * 3600;
      case 'd': return n * 86400;
      case 'w': return n * 604800;
      default: return n;
    }
  }

  async issue(
    user: User,
    roles: Role[],
    tenantId: string | null,
    deviceFingerprint?: string | null,
    ip?: string | null,
    userAgent?: string | null,
    scope?: {
      scope: 'invite';
      inviteCtx: InviteContext;
      // Cap the access-token TTL at this value (seconds). Used for invites so
      // a JWT minted from the link expires near the end of the appointment.
      accessTtlOverrideSec?: number;
      // Skip creating a Session + refresh token. Invite holders re-auth by
      // consuming the same invite URL again — no server-stored refresh needed.
      skipRefresh?: boolean;
      // Pin the issued JWT to this IP / UA-hash. The guard rejects later
      // requests that don't match. Omit to leave the dimension unbound.
      boundIp?: string;
      boundUaHash?: string;
    },
  ): Promise<IssuedTokens> {
    const defaultAccessTtl = this.parseTtlSeconds(this.config.jwt.accessTtl);
    const accessTtlSec =
      scope?.accessTtlOverrideSec !== undefined
        ? Math.max(60, Math.min(defaultAccessTtl, scope.accessTtlOverrideSec))
        : defaultAccessTtl;
    const refreshTtlSec = this.parseTtlSeconds(this.config.jwt.refreshTtl);

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      roles,
      tenantId,
      mfaEnabled: user.mfaEnabled,
      ...(scope
        ? {
            scope: scope.scope,
            inviteCtx: scope.inviteCtx,
            ...(scope.boundIp ? { boundIp: scope.boundIp } : {}),
            ...(scope.boundUaHash ? { boundUaHash: scope.boundUaHash } : {}),
          }
        : {}),
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: accessTtlSec,
    });

    if (scope?.skipRefresh) {
      return { accessToken, refreshToken: null, expiresIn: accessTtlSec };
    }

    const refreshTokenRaw = crypto.randomBytes(48).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: refreshTokenRaw },
      {
        secret: this.config.jwt.refreshSecret,
        expiresIn: refreshTtlSec,
      },
    );

    const session = this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash: this.hashToken(refreshToken),
      deviceFingerprint: deviceFingerprint ?? null,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt: new Date(Date.now() + refreshTtlSec * 1000),
    });
    await this.sessionRepo.save(session);

    return { accessToken, refreshToken, expiresIn: accessTtlSec };
  }

  // Mint a JWT for an anonymous-patient invite. There is no User, no Session
  // row, no refresh token — the invite link itself is the re-auth mechanism.
  // `anonIdentity` is the ConsultationInvite.id and acts as the opaque user
  // handle for LiveKit identity + audit correlation.
  async issueAnonymousInvite(params: {
    tenantId: string;
    inviteCtx: InviteContext;
    anonIdentity: string;
    accessTtlOverrideSec?: number;
    boundIp?: string;
    boundUaHash?: string;
  }): Promise<IssuedTokens> {
    const defaultAccessTtl = this.parseTtlSeconds(this.config.jwt.accessTtl);
    const accessTtlSec =
      params.accessTtlOverrideSec !== undefined
        ? Math.max(60, Math.min(defaultAccessTtl, params.accessTtlOverrideSec))
        : defaultAccessTtl;

    const payload: AccessTokenPayload = {
      sub: null,
      email: null,
      phone: null,
      roles: [Role.PATIENT],
      tenantId: params.tenantId,
      mfaEnabled: false,
      scope: 'invite-anon',
      inviteCtx: params.inviteCtx,
      anonIdentity: params.anonIdentity,
      ...(params.boundIp ? { boundIp: params.boundIp } : {}),
      ...(params.boundUaHash ? { boundUaHash: params.boundUaHash } : {}),
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: accessTtlSec,
    });
    return { accessToken, refreshToken: null, expiresIn: accessTtlSec };
  }

  async refresh(refreshToken: string): Promise<{ session: Session; payload: { sub: string } }> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.sessionRepo.findOne({
      where: { refreshTokenHash: tokenHash, userId: payload.sub },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }
    return { session, payload };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessionRepo.update(sessionId, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionRepo.update({ userId, revokedAt: undefined as never }, { revokedAt: new Date() });
  }
}
