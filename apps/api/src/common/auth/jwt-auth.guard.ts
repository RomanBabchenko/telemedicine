import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { AppConfig } from '../../config/env.config';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  INVITE_ACCESSIBLE_KEY,
  IS_PUBLIC_KEY,
  AuthUser,
  InviteContextField,
} from './decorators';

interface JwtPayload {
  sub: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  tenantId: string | null;
  mfaEnabled: boolean;
  scope?: 'full' | 'invite';
  inviteCtx?: { appointmentId: string; consultationSessionId: string };
  boundIp?: string;
  boundUaHash?: string;
}

// Same hash used at mint time (see InviteController). 16 hex chars is
// enough to detect UA substitution without bloating the JWT.
const hashUa = (ua: string): string =>
  createHash('sha256').update(ua).digest('hex').slice(0, 16);

const resolveClientIp = (req: Request): string | null => {
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing access token');
    }
    const token = auth.slice('Bearer '.length);
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      phone: payload.phone,
      roles: (payload.roles ?? []) as AuthUser['roles'],
      tenantId: payload.tenantId,
      mfaEnabled: payload.mfaEnabled,
      ...(payload.scope ? { scope: payload.scope } : {}),
      ...(payload.inviteCtx ? { inviteCtx: payload.inviteCtx } : {}),
    };

    (req as Request & { user?: AuthUser }).user = user;
    this.tenantContext.setActor(user.id);

    // Invite-scoped tokens are blocked from every endpoint that is not
    // explicitly marked with @InviteAccessible.
    if (user.scope === 'invite') {
      // Session binding (per-tenant policy). boundIp / boundUaHash are only
      // present in the JWT when the tenant opted in at consume time. A
      // mismatch means the token is being replayed from a different device
      // or network — treat as invalid, force re-consume of the invite.
      if (payload.boundIp) {
        const currentIp = resolveClientIp(req);
        if (!currentIp || currentIp !== payload.boundIp) {
          throw new UnauthorizedException(
            'Session mismatch — please reopen your invite link.',
          );
        }
      }
      if (payload.boundUaHash) {
        const currentUa = req.header('user-agent');
        if (!currentUa || hashUa(currentUa) !== payload.boundUaHash) {
          throw new UnauthorizedException(
            'Session mismatch — please reopen your invite link.',
          );
        }
      }

      const inviteMeta = this.reflector.getAllAndOverride<
        InviteContextField | true | undefined
      >(INVITE_ACCESSIBLE_KEY, [context.getHandler(), context.getClass()]);

      if (inviteMeta === undefined) {
        throw new ForbiddenException(
          'This resource is not available in an invite-only session.',
        );
      }

      if (typeof inviteMeta === 'string') {
        const expected = user.inviteCtx?.[inviteMeta];
        const actual = req.params?.id;
        if (!expected || !actual || expected !== actual) {
          throw new ForbiddenException(
            'This resource does not belong to the invited session.',
          );
        }
      }
    }

    return true;
  }
}
