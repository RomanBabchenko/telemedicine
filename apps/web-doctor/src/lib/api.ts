import { createApiClient } from '@telemed/api-client';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = createApiClient({
  // Default to relative path so the Vite dev proxy (`/api → :3000`) handles
  // it — avoids CORS preflight entirely. Override via VITE_API_URL in .env if
  // you really need to call a remote API directly.
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getTenantId: () => useAuthStore.getState().tenantId ?? null,
  onUnauthorized: () => useAuthStore.getState().logout(),
});
