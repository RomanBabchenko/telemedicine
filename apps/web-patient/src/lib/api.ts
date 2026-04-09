import { createApiClient } from '@telemed/api-client';
import { useAuthStore } from '../stores/auth.store';

// VITE_TENANT_ID acts as a hard override of which clinic the patient app
// talks to. When set (dev / single-clinic deployments) it WINS over the
// session tenant — otherwise a patient registered against PLATFORM_TENANT_ID
// would never see doctors of a CLINIC tenant. Leave it unset in
// multi-tenant production setups so the session-bound tenant takes effect.
const overrideTenantId =
  ((import.meta.env.VITE_TENANT_ID as string | undefined) ?? '').trim() || null;

export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  getAccessToken: () => useAuthStore.getState().tokens?.accessToken ?? null,
  getTenantId: () => overrideTenantId ?? useAuthStore.getState().tenantId ?? null,
  onUnauthorized: () => {
    useAuthStore.getState().logout();
  },
});
