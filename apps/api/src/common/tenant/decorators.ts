import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'requireFeature';
// Class- and handler-level requirements are merged (not overridden): a
// controller under @RequireFeature('misSync') with a handler marked
// @RequireFeature('audioArchive') needs both modules on.
export const RequireFeature = (...features: string[]) =>
  SetMetadata(REQUIRE_FEATURE_KEY, features);

export const ALLOW_CROSS_TENANT_KEY = 'allowCrossTenant';
export const AllowCrossTenant = () => SetMetadata(ALLOW_CROSS_TENANT_KEY, true);

export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenant ?? null;
});
