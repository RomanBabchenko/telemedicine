import { createApiClient, type ApiClient } from '@telemed/api-client';
import type { AuthStore } from './auth-store';
import { getBootstrapTenant } from './tenant-bootstrap';

// tenantId precedence: JWT default-membership (post-login) → tenant resolved
// from the clinic subdomain at startup (pre-login / after logout) → none.
// baseUrl defaults to a relative path so the Vite dev proxy (`/api → :3000`)
// handles it and CORS preflight is avoided; override via VITE_API_URL when
// calling a remote API.
export const createAppApiClient = (store: AuthStore, baseUrl?: string): ApiClient =>
  createApiClient({
    baseUrl: baseUrl ?? '/api/v1',
    getAccessToken: () => store.getState().tokens?.accessToken ?? null,
    getTenantId: () => store.getState().tenantId ?? getBootstrapTenant()?.id ?? null,
    onUnauthorized: () => store.getState().logout(),
  });
