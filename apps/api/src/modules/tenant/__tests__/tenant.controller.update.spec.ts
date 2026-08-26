import { ForbiddenException } from '@nestjs/common';
import { Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { TenantController } from '../api/tenant.controller';

const TENANT = 't-clinic';

const actor = (roles: Role[], tenantId = TENANT): AuthUser =>
  ({ id: 'u', email: 'a@x.test', phone: null, roles, tenantId, mfaEnabled: false }) as AuthUser;

const build = () => {
  const service = {
    update: jest.fn().mockResolvedValue({
      id: TENANT,
      slug: 'clinic',
      subdomain: 'clinic',
      brandName: 'Clinic',
      primaryColor: '#000',
      logoUrl: null,
      locale: 'uk',
      currency: 'UAH',
      featureMatrix: {},
      audioPolicy: null,
      invitePolicy: null,
      loginPolicy: null,
      billingPlanId: null,
      isPlatform: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
  const ctrl = new TenantController(service as never, {} as never);
  return { ctrl, service };
};

describe('PATCH /admin/tenants/:id — INTEGRATION_ADMIN is branding-only', () => {
  it('INTEGRATION_ADMIN may update branding fields', async () => {
    const { ctrl, service } = build();
    await ctrl.update(TENANT, { brandName: 'New', primaryColor: '#123456' } as never, actor([Role.INTEGRATION_ADMIN]));
    expect(service.update).toHaveBeenCalledWith(TENANT, expect.objectContaining({ brandName: 'New' }));
  });

  it.each([
    ['features', { features: { misSync: false } }],
    ['audioPolicy', { audioPolicy: { enabled: false } }],
    ['invitePolicy', { invitePolicy: { bindIp: true } }],
    ['loginPolicy', { loginPolicy: { doctorEnabled: false } }],
  ])('INTEGRATION_ADMIN is rejected when body contains %s', async (_k, body) => {
    const { ctrl, service } = build();
    await expect(
      ctrl.update(TENANT, { brandName: 'x', ...body } as never, actor([Role.INTEGRATION_ADMIN])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('CLINIC_ADMIN may toggle features', async () => {
    const { ctrl, service } = build();
    await ctrl.update(TENANT, { features: { misSync: true } } as never, actor([Role.CLINIC_ADMIN]));
    expect(service.update).toHaveBeenCalled();
  });

  it('an actor holding both INTEGRATION_ADMIN and CLINIC_ADMIN behaves as CLINIC_ADMIN', async () => {
    const { ctrl, service } = build();
    await ctrl.update(
      TENANT,
      { features: { misSync: true } } as never,
      actor([Role.INTEGRATION_ADMIN, Role.CLINIC_ADMIN]),
    );
    expect(service.update).toHaveBeenCalled();
  });

  it('INTEGRATION_ADMIN cannot touch a foreign tenant even for branding', async () => {
    const { ctrl } = build();
    await expect(
      ctrl.update('t-other', { brandName: 'x' } as never, actor([Role.INTEGRATION_ADMIN])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
