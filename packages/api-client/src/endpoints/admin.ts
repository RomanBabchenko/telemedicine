import type { CreateTenantDto, TenantDto, UpdateTenantDto } from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const adminApi = (client: ApiClient) => ({
  listTenants: () => client.get<TenantDto[]>('/admin/tenants'),
  createTenant: (dto: CreateTenantDto) => client.post<TenantDto>('/admin/tenants', dto),
  updateTenant: (id: string, dto: UpdateTenantDto) =>
    client.patch<TenantDto>(`/admin/tenants/${id}`, dto),
});
