import { TenantContextService } from '../tenant/tenant-context.service';

/**
 * Run a function with cross-tenant access enabled in the current AsyncLocalStorage context.
 * Used for platform super-admin endpoints and infrastructure jobs (sync, retention, etc.).
 */
export async function runCrossTenant<T>(
  tenantContext: TenantContextService,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = tenantContext.get();
  if (!ctx) {
    throw new Error('No tenant context to elevate');
  }
  const previous = ctx.allowCrossTenant;
  ctx.allowCrossTenant = true;
  try {
    return await fn();
  } finally {
    ctx.allowCrossTenant = previous ?? false;
  }
}
