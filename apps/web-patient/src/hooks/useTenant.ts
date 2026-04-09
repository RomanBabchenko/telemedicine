import { useQuery } from '@tanstack/react-query';
import type { TenantDto } from '@telemed/shared-types';
import { tenantsApi } from '@telemed/api-client';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

const api = tenantsApi(apiClient);

export const useTenant = (): TenantDto | null => {
  // The patient app is auth-gated, so we only fetch the tenant after
  // the user has signed in. tenantId in the queryKey makes React Query
  // refetch automatically when it changes (e.g. after switching role
  // / re-login as someone else).
  const tenantId = useAuthStore((s) => s.tenantId);
  const { data } = useQuery({
    queryKey: ['tenant', 'current', tenantId],
    queryFn: () => api.current(),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
  return data ?? null;
};
