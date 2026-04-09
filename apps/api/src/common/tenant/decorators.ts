import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'requireFeature';
export const RequireFeature = (feature: string) => SetMetadata(REQUIRE_FEATURE_KEY, feature);

export const ALLOW_CROSS_TENANT_KEY = 'allowCrossTenant';
export const AllowCrossTenant = () => SetMetadata(ALLOW_CROSS_TENANT_KEY, true);

export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenant ?? null;
});
