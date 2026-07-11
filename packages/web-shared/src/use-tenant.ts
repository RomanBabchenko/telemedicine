import { useQuery } from '@tanstack/react-query';
import type { TenantDto } from '@telemed/shared-types';
import { tenantsApi, type ApiClient } from '@telemed/api-client';
import type { AuthStore } from './auth-store';

// Factory so each app binds its own store + api client while keeping the
// call-site signature (`const tenant = useTenant()`).
export const createUseTenant = (store: AuthStore, client: ApiClient) => {
  const api = tenantsApi(client);
  return (): TenantDto | null => {
    // Apps are auth-gated, so we only fetch the tenant after sign-in.
    // tenantId in the queryKey makes React Query refetch automatically when
    // it changes (switching tenants / re-login as someone else) instead of
    // serving stale data under the old X-Tenant-Id header.
    const tenantId = store((s) => s.tenantId);
    const { data } = useQuery({
      queryKey: ['tenant', 'current', tenantId],
      queryFn: () => api.current(),
      enabled: !!tenantId,
      staleTime: 5 * 60_000,
    });
    return data ?? null;
  };
};
