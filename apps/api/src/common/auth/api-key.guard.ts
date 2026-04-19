import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@telemed/shared-types';
import { Request } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IntegrationApiKeyService } from '../../modules/mis-integration/application/integration-api-key.service';
import { AuthUser } from './decorators';

// Pseudo user id for audit logs — distinct UUID, not confused with real users.
const MIS_SERVICE_USER_ID = '00000000-0000-4000-8000-00000000ff01';

/**
 * Guard for M2M endpoints. Expects `Authorization: ApiKey tmd_live_...`.
 * Validates the key, checks it belongs to the tenant in the URL, enforces
 * the key's IP allowlist, and populates `req.user` with a MIS_SERVICE
 * pseudo-actor so downstream services (audit, tenant context) see a proper
 * authenticated caller.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: IntegrationApiKeyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const header = req.header('authorization') ?? '';
    if (!header.startsWith('ApiKey ')) {
      throw new UnauthorizedException(
        'Missing API key. Expected header "Authorization: ApiKey <key>".',
      );
    }
    const rawKey = header.slice('ApiKey '.length).trim();
    if (!rawKey) {
      throw new UnauthorizedException('Empty API key');
    }

    const key = await this.keys.findActiveByRaw(rawKey);
    if (!key) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Cross-tenant check — even a legitimate key must not reach endpoints
    // scoped to a different tenantId in the URL.
    const urlTenantId = req.params?.tenantId;
    if (urlTenantId && urlTenantId !== key.tenantId) {
      throw new ForbiddenException('API key does not belong to this tenant');
    }

    // IP allowlist
    const clientIp = this.resolveClientIp(req);
    if (!this.keys.ipMatches(key.ipAllowlist, clientIp)) {
      throw new ForbiddenException('Source IP is not in the key allowlist');
    }

    const authUser: AuthUser = {
      id: MIS_SERVICE_USER_ID,
      email: null,
      phone: null,
      roles: [Role.MIS_SERVICE],
      tenantId: key.tenantId,
      mfaEnabled: false,
      scope: 'service',
    };
    (req as Request & { user?: AuthUser }).user = authUser;
    // Expose the key record (not the raw secret) so downstream handlers can
    // scope external-id lookups by connectorId without re-querying the DB.
    (req as Request & { apiKey?: { id: string; tenantId: string; connectorId: string } }).apiKey = {
      id: key.id,
      tenantId: key.tenantId,
      connectorId: key.connectorId,
    };
    this.tenantContext.setTenantId(key.tenantId);
    this.tenantContext.setActor(authUser.id);

    // Fire-and-forget update — no await, no blocking.
    this.keys.touchLastUsed(key.id);

    return true;
  }

  private resolveClientIp(req: Request): string | null {
    // Trust the first non-empty candidate. Express's `req.ip` already respects
    // `trust proxy`, but some deploy topologies pass XFF explicitly.
    const xff = req.header('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.ip ?? null;
  }
}
