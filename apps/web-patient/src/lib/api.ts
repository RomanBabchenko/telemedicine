import { createApiClient } from '@telemed/api-client';
import { useAuthStore } from '../stores/auth.store';

// The patient app is auth-gated: every page sits behind <ProtectedRoutes>,
// which redirects to /auth/login when there's no session. So tenantId is
// always whatever the JWT default-membership pointed at — no env override.
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getTenantId: () => useAuthStore.getState().tenantId ?? null,
  onUnauthorized: () => {
    useAuthStore.getState().logout();
  },
});
