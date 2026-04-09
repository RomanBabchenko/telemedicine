import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfig } from '../../config/env.config';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IS_PUBLIC_KEY, AuthUser } from './decorators';

interface JwtPayload {
  sub: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  tenantId: string | null;
  mfaEnabled: boolean;
}

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
    };

    (req as Request & { user?: AuthUser }).user = user;
    this.tenantContext.setActor(user.id);
    return true;
  }
}
