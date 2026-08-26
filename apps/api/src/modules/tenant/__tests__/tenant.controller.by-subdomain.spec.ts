import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantController } from '../api/tenant.controller';

const TENANT = {
  id: 't-harmony',
  slug: 'harmony',
  subdomain: 'harmony',
  brandName: 'Harmony Clinic',
  primaryColor: '#2a9d8f',
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
};

const build = () => {
  const service = { findBySubdomain: jest.fn().mockResolvedValue(TENANT) };
  const ctrl = new TenantController(service as never, {} as never);
  return { ctrl, service };
};

describe('GET /tenants/by-subdomain/:subdomain', () => {
  it('resolves an existing clinic subdomain to its branding DTO', async () => {
    const { ctrl, service } = build();
    const dto = await ctrl.bySubdomain('harmony');
    expect(service.findBySubdomain).toHaveBeenCalledWith('harmony');
    expect(dto).toMatchObject({
      id: 't-harmony',
      subdomain: 'harmony',
      brandName: 'Harmony Clinic',
    });
  });

  it('404 for an unknown subdomain', async () => {
    const { ctrl, service } = build();
    service.findBySubdomain.mockResolvedValue(null);
    await expect(ctrl.bySubdomain('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([['UPPER'], ['bad!chars'], ['with space'], [''], ['a'.repeat(129)]])(
    'rejects malformed subdomain %p without touching the DB',
    async (sub) => {
      const { ctrl, service } = build();
      await expect(ctrl.bySubdomain(sub)).rejects.toBeInstanceOf(BadRequestException);
      expect(service.findBySubdomain).not.toHaveBeenCalled();
    },
  );
});
