import { createApiClient } from '@telemed/api-client';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getTenantId: () => useAuthStore.getState().tenantId ?? null,
  onUnauthorized: () => useAuthStore.getState().logout(),
});
