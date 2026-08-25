import type { TenantDto, UpdateTenantDto } from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const tenantsApi = (client: ApiClient) => ({
  current: () => client.get<TenantDto>('/tenants/current'),
  bySubdomain: (subdomain: string) =>
    client.get<TenantDto>(`/tenants/by-subdomain/${subdomain}`),
  update: (id: string, dto: UpdateTenantDto) =>
    client.patch<TenantDto>(`/admin/tenants/${id}`, dto),
});
