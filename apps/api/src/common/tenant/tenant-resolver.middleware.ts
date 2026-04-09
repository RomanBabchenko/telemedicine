import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AppConfig } from '../../config/env.config';
import { TenantContextService } from './tenant-context.service';

interface JwtPayload {
  sub: string;
  tenantId?: string;
  roles?: string[];
}

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantHeader = (req.header('x-tenant-id') ?? '').trim();
    const subdomain = this.extractSubdomain(req.hostname);
    let actorUserId: string | null = null;
    let tokenTenantId: string | null = null;

    const auth = req.header('authorization');
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length);
      try {
        const payload = this.jwt.verify<JwtPayload>(token, {
          secret: this.config.jwt.accessSecret,
        });
        actorUserId = payload.sub;
        if (payload.tenantId) tokenTenantId = payload.tenantId;
      } catch {
        // Token invalid: leave to JwtAuthGuard later. Don't break the request here.
      }
    }

    const tenantId =
      tenantHeader || tokenTenantId || subdomain || this.config.platformTenantId;

    this.tenantContext.run(
      {
        tenantId,
        actorUserId,
        ip: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      },
      () => next(),
    );
  }

  private extractSubdomain(hostname: string): string | null {
    if (!hostname) return null;
    const parts = hostname.split('.');
    if (parts.length < 2) return null;
    const sub = parts[0];
    if (!sub || sub === 'www' || sub === 'localhost') return null;
    return null; // Resolved against DB later in TenantService; middleware only forwards subdomain hint
  }
}
