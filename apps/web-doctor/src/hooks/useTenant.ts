import { useQuery } from '@tanstack/react-query';
import type { TenantDto } from '@telemed/shared-types';
import { tenantsApi } from '@telemed/api-client';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

const api = tenantsApi(apiClient);

export const useTenant = (): TenantDto | null => {
  // Bake tenantId into the cache key so logging in (or switching tenants)
  // forces React Query to refetch /tenants/current under the new
  // X-Tenant-Id header instead of serving stale anonymous-fallback data.
  const tenantId = useAuthStore((s) => s.tenantId);
  const { data } = useQuery({
    queryKey: ['tenant', 'current', tenantId],
    queryFn: () => api.current(),
    staleTime: 5 * 60_000,
  });
  return data ?? null;
};
