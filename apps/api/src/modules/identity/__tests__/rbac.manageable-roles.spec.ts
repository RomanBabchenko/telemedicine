import {
  ADMIN_CONSOLE_ROLES,
  ALL_ROLES,
  ROLE_LABELS,
  Role,
  canManageRole,
  hasAnyRole,
  isFullTenantAdmin,
  isMisScopedActor,
  isPlatformActor,
  manageableRolesFor,
} from '@telemed/shared-types';

describe('rbac: manageable roles matrix', () => {
  it('ROLE_LABELS covers every Role value (and nothing else)', () => {
    expect([...ALL_ROLES].sort()).toEqual(Object.values(Role).sort());
    for (const r of Object.values(Role)) expect(ROLE_LABELS[r]).toBeTruthy();
  });

  it('PLATFORM_SUPER_ADMIN manages every role', () => {
    expect([...manageableRolesFor([Role.PLATFORM_SUPER_ADMIN])].sort()).toEqual(
      Object.values(Role).sort(),
    );
  });

  it('CLINIC_ADMIN manages clinic roles incl. the two new ones, but no platform roles', () => {
    const set = manageableRolesFor([Role.CLINIC_ADMIN]);
    expect(set).toEqual(
      expect.arrayContaining([
        Role.DOCTOR,
        Role.CLINIC_OPERATOR,
        Role.CLINIC_ADMIN,
        Role.PATIENT,
        Role.INTEGRATION_ADMIN,
        Role.CHIEF_MEDICAL_OFFICER,
      ]),
    );
    expect(set).toHaveLength(6);
    for (const r of [
      Role.PLATFORM_SUPER_ADMIN,
      Role.PLATFORM_SUPPORT,
      Role.PLATFORM_FINANCE,
      Role.MIS_SERVICE,
      Role.AUDITOR,
    ]) {
      expect(canManageRole([Role.CLINIC_ADMIN], r)).toBe(false);
    }
  });

  it('INTEGRATION_ADMIN manages only INTEGRATION_ADMIN and CHIEF_MEDICAL_OFFICER', () => {
    expect([...manageableRolesFor([Role.INTEGRATION_ADMIN])].sort()).toEqual(
      [Role.CHIEF_MEDICAL_OFFICER, Role.INTEGRATION_ADMIN].sort(),
    );
    expect(canManageRole([Role.INTEGRATION_ADMIN], Role.CLINIC_ADMIN)).toBe(false);
    expect(canManageRole([Role.INTEGRATION_ADMIN], Role.DOCTOR)).toBe(false);
    expect(canManageRole([Role.INTEGRATION_ADMIN], Role.PATIENT)).toBe(false);
  });

  it('CHIEF_MEDICAL_OFFICER (and DOCTOR / PATIENT) manage nobody', () => {
    expect(manageableRolesFor([Role.CHIEF_MEDICAL_OFFICER])).toEqual([]);
    expect(manageableRolesFor([Role.DOCTOR, Role.PATIENT])).toEqual([]);
    expect(manageableRolesFor(undefined)).toEqual([]);
  });

  it('a combined CLINIC_ADMIN + INTEGRATION_ADMIN actor gets the CLINIC_ADMIN set', () => {
    expect(manageableRolesFor([Role.INTEGRATION_ADMIN, Role.CLINIC_ADMIN])).toEqual(
      manageableRolesFor([Role.CLINIC_ADMIN]),
    );
  });
});

describe('rbac: actor classification', () => {
  it('isMisScopedActor is true only for INTEGRATION_ADMIN without a full-admin role', () => {
    expect(isMisScopedActor([Role.INTEGRATION_ADMIN])).toBe(true);
    expect(isMisScopedActor([Role.INTEGRATION_ADMIN, Role.CHIEF_MEDICAL_OFFICER])).toBe(true);
    expect(isMisScopedActor([Role.INTEGRATION_ADMIN, Role.CLINIC_ADMIN])).toBe(false);
    expect(isMisScopedActor([Role.INTEGRATION_ADMIN, Role.PLATFORM_SUPER_ADMIN])).toBe(false);
    expect(isMisScopedActor([Role.CLINIC_ADMIN])).toBe(false);
    expect(isMisScopedActor([Role.CHIEF_MEDICAL_OFFICER])).toBe(false);
    expect(isMisScopedActor(undefined)).toBe(false);
  });

  it('isFullTenantAdmin / isPlatformActor', () => {
    expect(isFullTenantAdmin([Role.CLINIC_ADMIN])).toBe(true);
    expect(isFullTenantAdmin([Role.PLATFORM_SUPER_ADMIN])).toBe(true);
    expect(isFullTenantAdmin([Role.INTEGRATION_ADMIN])).toBe(false);
    expect(isPlatformActor([Role.PLATFORM_SUPER_ADMIN])).toBe(true);
    expect(isPlatformActor([Role.CLINIC_ADMIN])).toBe(false);
  });

  it('ADMIN_CONSOLE_ROLES admits the four console roles and nothing else', () => {
    for (const r of [
      Role.PLATFORM_SUPER_ADMIN,
      Role.CLINIC_ADMIN,
      Role.INTEGRATION_ADMIN,
      Role.CHIEF_MEDICAL_OFFICER,
    ]) {
      expect(hasAnyRole([r], ADMIN_CONSOLE_ROLES)).toBe(true);
    }
    expect(hasAnyRole([Role.DOCTOR], ADMIN_CONSOLE_ROLES)).toBe(false);
    expect(hasAnyRole([Role.PATIENT], ADMIN_CONSOLE_ROLES)).toBe(false);
    expect(hasAnyRole(undefined, ADMIN_CONSOLE_ROLES)).toBe(false);
  });
});
