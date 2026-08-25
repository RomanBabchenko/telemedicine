import type { TenantDto } from '@telemed/shared-types';
import { tenantsApi, type ApiClient } from '@telemed/api-client';

export type AppName = 'patient' | 'doctor' | 'admin';
export type BootstrapStatus = 'none' | 'ok' | 'not-found' | 'error';

// Module-level so the api-client interceptor and useTenant can read the
// pre-login tenant without threading it through React state. Set once at
// startup (bootstrapTenant runs before the first render).
let bootTenant: TenantDto | null = null;

/**
 * Clinic slug from the hostname:
 *   harmony.patient.medview.com.ua → 'harmony'  (parts[1] must match the app)
 *   harmony.localhost              → 'harmony'  (dev — *.localhost hits 127.0.0.1)
 *   patient.medview.com.ua / localhost → null   (no clinic — legacy behaviour)
 */
export const resolveClinicSlug = (hostname: string, appName: AppName): string | null => {
  const parts = hostname.split('.');
  if (parts.length === 2 && parts[1] === 'localhost') return parts[0] || null;
  if (parts.length >= 3 && parts[1] === appName) return parts[0] || null;
  return null;
};

/**
 * Resolve the clinic tenant from the current hostname before the app renders.
 * On success the tenant id backs the X-Tenant-Id header for every request
 * (including login/register) and seeds useTenant, so branding is correct
 * pre-auth. 'error' (API unreachable) falls back to legacy behaviour rather
 * than blocking the app.
 */
export const bootstrapTenant = async (
  client: ApiClient,
  appName: AppName,
): Promise<BootstrapStatus> => {
  const slug = resolveClinicSlug(window.location.hostname, appName);
  if (!slug) return 'none';
  try {
    bootTenant = await tenantsApi(client).bySubdomain(slug);
    return 'ok';
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    return status === 404 || status === 400 ? 'not-found' : 'error';
  }
};

export const getBootstrapTenant = (): TenantDto | null => bootTenant;
