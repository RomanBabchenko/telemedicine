import { useQuery } from '@tanstack/react-query';
import type { TenantDto } from '@telemed/shared-types';
import { tenantsApi, type ApiClient } from '@telemed/api-client';
import type { AuthStore } from './auth-store';
import { getBootstrapTenant } from './tenant-bootstrap';

// Factory so each app binds its own store + api client while keeping the
// call-site signature (`const tenant = useTenant()`).
export const createUseTenant = (store: AuthStore, client: ApiClient) => {
  const api = tenantsApi(client);
  return (): TenantDto | null => {
    // Post-login the JWT membership wins; pre-login (and after logout) fall
    // back to the tenant resolved from the clinic subdomain at startup, so
    // the login page renders with the clinic's branding.
    // tenantId in the queryKey makes React Query refetch automatically when
    // it changes (switching tenants / re-login as someone else) instead of
    // serving stale data under the old X-Tenant-Id header.
    const storeTenantId = store((s) => s.tenantId);
    const boot = getBootstrapTenant();
    const tenantId = storeTenantId ?? boot?.id ?? null;
    const { data } = useQuery({
      queryKey: ['tenant', 'current', tenantId],
      queryFn: () => api.current(),
      enabled: !!tenantId,
      staleTime: 5 * 60_000,
      initialData: boot && boot.id === tenantId ? boot : undefined,
    });
    return data ?? null;
  };
};
