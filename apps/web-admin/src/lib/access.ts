import type { Role, TenantFeatureKey } from '@telemed/shared-types';

// Single source of truth for "who sees which section" in the admin console.
// Nav (AppLayout) and routes (App.tsx) both read from here, so a role can't
// end up with a visible link to a page it cannot open — or vice versa.
//
// The API enforces everything server-side; this is purely UX gating.
//
//   FULL = CLINIC_ADMIN, PLATFORM_SUPER_ADMIN — everything
//   IA   = INTEGRATION_ADMIN — everything except doctors / MIS sync / modules
//   CMO  = CHIEF_MEDICAL_OFFICER — dashboard, appointments, analytics only
const FULL: readonly Role[] = ['CLINIC_ADMIN', 'PLATFORM_SUPER_ADMIN'];
const IA: Role = 'INTEGRATION_ADMIN';
const CMO: Role = 'CHIEF_MEDICAL_OFFICER';

export interface AdminSection {
  to: string;
  label: string;
  roles: readonly Role[];
  /** Hides the item when the tenant module is off (see FeaturesPage). */
  feature?: TenantFeatureKey;
}

export const CLINIC_SECTIONS: readonly AdminSection[] = [
  // Dashboard and analytics are TEMPORARILY closed to IA/CMO (mirror of the
  // @Roles change on GET analytics/tenant/:id) — restore [...FULL, IA, CMO]
  // on both rows and the controller together when re-enabling.
  { to: '/', label: 'Дашборд', roles: FULL },
  { to: '/doctors', label: 'Лікарі', roles: FULL },
  { to: '/appointments', label: 'Прийоми', roles: [...FULL, IA, CMO] },
  { to: '/users', label: 'Користувачі', roles: [...FULL, IA] },
  { to: '/integrations', label: 'МІС', roles: FULL, feature: 'misSync' },
  { to: '/integration-keys', label: 'API ключі', roles: [...FULL, IA], feature: 'apiAccess' },
  // Billing is TEMPORARILY closed to IA (mirror of the @Roles change in
  // BillingController) — restore [...FULL, IA] here and there together.
  { to: '/billing', label: 'Білінг', roles: FULL },
  { to: '/analytics', label: 'Аналітика', roles: FULL, feature: 'analyticsPackage' },
  { to: '/branding', label: 'Брендинг', roles: [...FULL, IA] },
  { to: '/features', label: 'Модулі', roles: FULL },
  { to: '/audit', label: 'Аудит', roles: [...FULL, IA] },
];

/** Roles allowed to open the section mounted at `to` (defaults to FULL). */
export const sectionRoles = (to: string): readonly Role[] =>
  CLINIC_SECTIONS.find((s) => s.to === to)?.roles ?? FULL;

/**
 * Where to land a user who cannot open the requested section. `/` is not a
 * safe universal fallback any more — IA/CMO have no dashboard access, and
 * redirecting them there would bounce forever.
 */
export const firstAccessiblePath = (roles: readonly Role[] | undefined): string =>
  CLINIC_SECTIONS.find((s) => roles?.some((r) => s.roles.includes(r)))?.to ?? '/auth/login';
