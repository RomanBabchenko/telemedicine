import { createApiClient, type ApiClient } from '@telemed/api-client';
import type { AuthStore } from './auth-store';

// All three SPAs are auth-gated, so tenantId is whatever the JWT
// default-membership pointed at — no env override. baseUrl defaults to a
// relative path so the Vite dev proxy (`/api → :3000`) handles it and CORS
// preflight is avoided; override via VITE_API_URL when calling a remote API.
export const createAppApiClient = (store: AuthStore, baseUrl?: string): ApiClient =>
  createApiClient({
    baseUrl: baseUrl ?? '/api/v1',
    getAccessToken: () => store.getState().tokens?.accessToken ?? null,
    getTenantId: () => store.getState().tenantId ?? null,
    onUnauthorized: () => store.getState().logout(),
  });
