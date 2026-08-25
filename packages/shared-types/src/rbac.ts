// Role-based access helpers shared by the API and the admin SPA.
//
// IMPORTANT: this module must NOT import runtime values from './enums' —
// see the comment at the top of index.ts about Vite serving a stale
// `enums.js`. Only the `Role` *type* is imported; role values are spelled
// as string literals (they are checked against the Role union by TS).
import type { Role } from './enums';

// Ukrainian labels for the admin UI (previously three hand-maintained copies
// in web-admin).
export const ROLE_LABELS: Record<Role, string> = {
  PATIENT: 'Пацієнт',
  DOCTOR: 'Лікар',
  CLINIC_OPERATOR: 'Оператор клініки',
  CLINIC_ADMIN: 'Адмін клініки',
  INTEGRATION_ADMIN: 'Інтеграційний адмін',
  CHIEF_MEDICAL_OFFICER: 'Начмед',
  PLATFORM_SUPER_ADMIN: 'Супер-адмін платформи',
  PLATFORM_SUPPORT: 'Підтримка платформи',
  PLATFORM_FINANCE: 'Фінансист платформи',
  MIS_SERVICE: 'Сервіс МІС',
  AUDITOR: 'Аудитор',
};

export const ALL_ROLES: readonly Role[] = Object.keys(ROLE_LABELS) as Role[];

// Roles that have full, tenant-wide admin powers inside a clinic. Anything
// MIS-scoped (INTEGRATION_ADMIN) is deliberately NOT here.
export const FULL_TENANT_ADMIN_ROLES: readonly Role[] = [
  'CLINIC_ADMIN',
  'PLATFORM_SUPER_ADMIN',
];

// Roles that may sign in to the clinic admin console at all.
export const ADMIN_CONSOLE_ROLES: readonly Role[] = [
  'PLATFORM_SUPER_ADMIN',
  'CLINIC_ADMIN',
  'INTEGRATION_ADMIN',
  'CHIEF_MEDICAL_OFFICER',
];

// Which membership roles an actor holding the key role may create / grant /
// revoke / block. Roles absent from the map manage nobody.
export const MANAGEABLE_ROLES: Partial<Record<Role, readonly Role[]>> = {
  PLATFORM_SUPER_ADMIN: ALL_ROLES,
  CLINIC_ADMIN: [
    'DOCTOR',
    'CLINIC_OPERATOR',
    'CLINIC_ADMIN',
    'PATIENT',
    'INTEGRATION_ADMIN',
    'CHIEF_MEDICAL_OFFICER',
  ],
  INTEGRATION_ADMIN: ['INTEGRATION_ADMIN', 'CHIEF_MEDICAL_OFFICER'],
};

// Union of manageable roles over every role the actor holds, in ROLE_LABELS
// order so UI dropdowns are stable.
export const manageableRolesFor = (actorRoles: readonly Role[] | undefined): Role[] => {
  const set = new Set<Role>();
  for (const r of actorRoles ?? []) {
    for (const m of MANAGEABLE_ROLES[r] ?? []) set.add(m);
  }
  return ALL_ROLES.filter((r) => set.has(r));
};

export const canManageRole = (
  actorRoles: readonly Role[] | undefined,
  target: Role,
): boolean => manageableRolesFor(actorRoles).includes(target);

export const isPlatformActor = (roles: readonly Role[] | undefined): boolean =>
  !!roles?.includes('PLATFORM_SUPER_ADMIN');

export const isFullTenantAdmin = (roles: readonly Role[] | undefined): boolean =>
  !!roles?.some((r) => FULL_TENANT_ADMIN_ROLES.includes(r));

// "MIS-scoped" = holds INTEGRATION_ADMIN and none of the full-admin roles.
// A user who is both CLINIC_ADMIN and INTEGRATION_ADMIN behaves as CLINIC_ADMIN.
export const isMisScopedActor = (roles: readonly Role[] | undefined): boolean =>
  !!roles?.includes('INTEGRATION_ADMIN') && !isFullTenantAdmin(roles);

export const hasAnyRole = (
  roles: readonly Role[] | undefined,
  allowed: readonly Role[],
): boolean => !!roles?.some((r) => allowed.includes(r));
