import { ForbiddenException } from '@nestjs/common';
import { Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { AdminUserController } from '../api/admin-user.controller';

const TENANT = 't-clinic';

const actor = (roles: Role[]): AuthUser =>
  ({
    id: 'actor-1',
    email: 'a@x.test',
    phone: null,
    roles,
    tenantId: TENANT,
    mfaEnabled: false,
  }) as AuthUser;

const detail = (id: string) => ({
  id,
  email: `${id}@x.test`,
  phone: null,
  firstName: 'F',
  lastName: 'L',
  status: 'ACTIVE',
  mfaEnabled: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  memberships: [],
});

const build = () => {
  const users = {
    list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    getDetail: jest.fn().mockImplementation((id: string) => Promise.resolve(detail(id))),
    getMembershipRolesInTenant: jest.fn().mockResolvedValue([]),
    createOrAttach: jest
      .fn()
      .mockResolvedValue({ user: detail('new'), reused: false, generatedPassword: 'tmp' }),
    findByEmail: jest.fn().mockResolvedValue(null),
    addMembership: jest.fn().mockResolvedValue(undefined),
    revokeMembership: jest.fn().mockResolvedValue(undefined),
    setDefaultMembership: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue({ temporaryPassword: 'tmp' }),
  };
  const providers = { create: jest.fn(), attachToTenant: jest.fn(), detachFromTenant: jest.fn() };
  const patients = { ensurePatientProfile: jest.fn() };
  const tenantContext = { getTenantId: jest.fn().mockReturnValue(TENANT) };
  const ctrl = new AdminUserController(
    users as never,
    providers as never,
    patients as never,
    tenantContext as never,
  );
  return { ctrl, users };
};

const IA = [Role.INTEGRATION_ADMIN];
const CA = [Role.CLINIC_ADMIN];

describe('AdminUserController — role management matrix', () => {
  describe('create', () => {
    const body = (role: Role) =>
      ({ email: 'n@x.test', firstName: 'N', lastName: 'U', role }) as never;

    it('INTEGRATION_ADMIN cannot create CLINIC_ADMIN / DOCTOR / PATIENT', async () => {
      const { ctrl, users } = build();
      for (const role of [Role.CLINIC_ADMIN, Role.DOCTOR, Role.PATIENT, Role.CLINIC_OPERATOR]) {
        await expect(ctrl.create(body(role), actor(IA))).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(users.createOrAttach).not.toHaveBeenCalled();
    });

    it('INTEGRATION_ADMIN can create INTEGRATION_ADMIN and CHIEF_MEDICAL_OFFICER', async () => {
      const { ctrl, users } = build();
      await ctrl.create(body(Role.CHIEF_MEDICAL_OFFICER), actor(IA));
      await ctrl.create(body(Role.INTEGRATION_ADMIN), actor(IA));
      expect(users.createOrAttach).toHaveBeenCalledTimes(2);
      expect(users.createOrAttach.mock.calls[0][0]).toMatchObject({
        role: Role.CHIEF_MEDICAL_OFFICER,
        tenantId: TENANT,
      });
    });

    it('CLINIC_ADMIN can create the two new roles but not platform roles', async () => {
      const { ctrl } = build();
      await expect(ctrl.create(body(Role.INTEGRATION_ADMIN), actor(CA))).resolves.toBeTruthy();
      await expect(ctrl.create(body(Role.CHIEF_MEDICAL_OFFICER), actor(CA))).resolves.toBeTruthy();
      await expect(ctrl.create(body(Role.PLATFORM_SUPER_ADMIN), actor(CA))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('non-platform actors cannot target a foreign tenant', async () => {
      const { ctrl } = build();
      await expect(
        ctrl.create({ ...(body(Role.CHIEF_MEDICAL_OFFICER) as object), tenantId: 't-other' } as never, actor(IA)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('list', () => {
    it('INTEGRATION_ADMIN list is restricted to manageable roles', async () => {
      const { ctrl, users } = build();
      await ctrl.list({} as never, actor(IA));
      expect(users.list).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT,
          roles: expect.arrayContaining([Role.INTEGRATION_ADMIN, Role.CHIEF_MEDICAL_OFFICER]),
        }),
      );
      const { roles } = users.list.mock.calls[0][0] as { roles: Role[] };
      expect(roles).toHaveLength(2);
    });

    it('PLATFORM_SUPER_ADMIN list is unrestricted', async () => {
      const { ctrl, users } = build();
      await ctrl.list({ scope: 'all' } as never, actor([Role.PLATFORM_SUPER_ADMIN]));
      expect(users.list.mock.calls[0][0]).toMatchObject({ tenantId: undefined, roles: undefined });
    });
  });

  describe('mutating an existing user', () => {
    it('INTEGRATION_ADMIN cannot block a user who holds DOCTOR in the tenant', async () => {
      const { ctrl, users } = build();
      users.getMembershipRolesInTenant.mockResolvedValue([Role.DOCTOR]);
      await expect(
        ctrl.setStatus('u-1', { status: 'BLOCKED' } as never, actor(IA)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(users.setStatus).not.toHaveBeenCalled();
    });

    it('INTEGRATION_ADMIN cannot reset the password of a CLINIC_ADMIN', async () => {
      const { ctrl, users } = build();
      users.getMembershipRolesInTenant.mockResolvedValue([Role.CLINIC_ADMIN]);
      await expect(ctrl.resetPassword('u-1', actor(IA))).rejects.toBeInstanceOf(ForbiddenException);
      expect(users.resetPassword).not.toHaveBeenCalled();
    });

    it('INTEGRATION_ADMIN can block / reset a CHIEF_MEDICAL_OFFICER', async () => {
      const { ctrl, users } = build();
      users.getMembershipRolesInTenant.mockResolvedValue([Role.CHIEF_MEDICAL_OFFICER]);
      await ctrl.setStatus('u-1', { status: 'BLOCKED' } as never, actor(IA));
      await ctrl.resetPassword('u-1', actor(IA));
      expect(users.setStatus).toHaveBeenCalledWith('u-1', 'BLOCKED');
      expect(users.resetPassword).toHaveBeenCalledWith('u-1');
    });

    it('CLINIC_ADMIN can block an INTEGRATION_ADMIN', async () => {
      const { ctrl, users } = build();
      users.getMembershipRolesInTenant.mockResolvedValue([Role.INTEGRATION_ADMIN]);
      await ctrl.setStatus('u-1', { status: 'BLOCKED' } as never, actor(CA));
      expect(users.setStatus).toHaveBeenCalled();
    });

    it('PLATFORM_SUPER_ADMIN bypasses the per-user check', async () => {
      const { ctrl, users } = build();
      users.getMembershipRolesInTenant.mockResolvedValue([Role.CLINIC_ADMIN]);
      await ctrl.setStatus('u-1', { status: 'BLOCKED' } as never, actor([Role.PLATFORM_SUPER_ADMIN]));
      expect(users.setStatus).toHaveBeenCalled();
      expect(users.getMembershipRolesInTenant).not.toHaveBeenCalled();
    });

    it('revoking a membership requires the actor to manage that role', async () => {
      const { ctrl, users } = build();
      users.getMembershipRolesInTenant.mockResolvedValue([Role.CHIEF_MEDICAL_OFFICER, Role.DOCTOR]);
      await expect(ctrl.revokeMembership('u-1', 'm-1', actor(IA))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(users.revokeMembership).not.toHaveBeenCalled();
    });
  });
});
