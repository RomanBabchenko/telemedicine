import { useQuery } from '@tanstack/react-query';
import type { TenantDto } from '@telemed/shared-types';
import { tenantsApi } from '@telemed/api-client';
import { apiClient } from '../lib/api';

const api = tenantsApi(apiClient);

export const useTenant = (): TenantDto | null => {
  const { data } = useQuery({
    queryKey: ['tenant', 'current'],
    queryFn: () => api.current(),
    staleTime: 5 * 60_000,
  });
  return data ?? null;
};
