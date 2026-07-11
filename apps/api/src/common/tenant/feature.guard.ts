import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from '../../modules/tenant/application/tenant.service';
import { TenantContextService } from './tenant-context.service';
import { REQUIRE_FEATURE_KEY } from './decorators';

// Enforces the tenant feature matrix ("clinic modules"). Routes/controllers
// marked @RequireFeature('<key>') return 403 FEATURE_DISABLED when the
// tenant has the module switched off. Unmarked routes are unaffected.
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenants: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const tenantId = this.tenantContext.getTenantId();
    const tenant = await this.tenants.getOrThrow(tenantId);
    if (!this.tenants.hasFeature(tenant, feature)) {
      throw new ForbiddenException({
        message: `Module "${feature}" is disabled for this clinic`,
        code: 'FEATURE_DISABLED',
      });
    }
    return true;
  }
}
