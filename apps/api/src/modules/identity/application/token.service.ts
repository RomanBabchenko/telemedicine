import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { Role } from '@telemed/shared-types';
import { AppConfig } from '../../../config/env.config';
import { Session } from '../domain/entities/session.entity';
import { User } from '../domain/entities/user.entity';

export interface AccessTokenPayload {
  sub: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  tenantId: string | null;
  mfaEnabled: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
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
  ): Promise<IssuedTokens> {
    const accessTtlSec = this.parseTtlSeconds(this.config.jwt.accessTtl);
    const refreshTtlSec = this.parseTtlSeconds(this.config.jwt.refreshTtl);

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      roles,
      tenantId,
      mfaEnabled: user.mfaEnabled,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: accessTtlSec,
    });

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
