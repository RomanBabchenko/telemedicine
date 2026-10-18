import { ForbiddenException } from '@nestjs/common';
import { Role } from '@telemed/shared-types';
import { TenantContextService } from '../../../../common/tenant/tenant-context.service';
import { AuthService } from '../auth.service';

// A doctor who works in two clinics. Harmony is the default membership and,
// like Medlife, only accepts sign-ins from its own subdomain.
const HARMONY = 'harmony-id';
const MEDLIFE = 'medlife-id';
const OTHER = 'other-clinic-id';

const tenantsById: Record<string, unknown> = {
  [HARMONY]: { id: HARMONY, subdomain: 'harmony', isPlatform: false, loginPolicy: { requireSubdomain: true } },
  [MEDLIFE]: { id: MEDLIFE, subdomain: 'medlife', isPlatform: false, loginPolicy: { requireSubdomain: true } },
  [OTHER]: { id: OTHER, subdomain: 'other', isPlatform: false, loginPolicy: { requireSubdomain: false } },
};

const memberships: Record<string, Role[]> = {
  [HARMONY]: [Role.DOCTOR],
  [MEDLIFE]: [Role.DOCTOR],
};

const user = {
  id: 'u-1',
  email: 'ivanova@example.com',
  phone: null,
  firstName: 'Олена',
  lastName: 'Іванова',
  passwordHash: 'hash',
  status: 'ACTIVE',
  mfaEnabled: false,
  mfaSecret: null,
};

const build = () => {
  const tenantContext = new TenantContextService();
  const userService = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findByPhone: jest.fn().mockResolvedValue(null),
    getByIdOrThrow: jest.fn().mockResolvedValue(user),
    getDefaultTenantId: jest.fn().mockResolvedValue(HARMONY),
    getMembershipRolesInTenant: jest
      .fn()
      .mockImplementation((_userId: string, tenantId: string) => Promise.resolve(memberships[tenantId] ?? [])),
    getRoles: jest
      .fn()
      .mockImplementation((_userId: string, tenantId?: string | null) =>
        Promise.resolve(tenantId ? memberships[tenantId] ?? [] : Object.values(memberships).flat()),
      ),
  };
  const tenants = {
    canLogin: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockImplementation((id: string) => Promise.resolve(tenantsById[id] ?? null)),
  };
  const tokens = {
    issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    refresh: jest.fn().mockResolvedValue({ session: { id: 's-1' }, payload: { sub: user.id } }),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const passwords = { verify: jest.fn().mockResolvedValue(true) };

  const service = new AuthService(
    {} as never, // users repo
    {} as never, // patients repo
    passwords as never,
    tokens as never,
    {} as never, // otp
    {} as never, // magic link
    {} as never, // mfa
    userService as never,
    {} as never, // config
    tenantContext,
    tenants as never,
  );
  return { service, tenantContext, tokens, userService };
};

const login = (service: AuthService, origin: string) =>
  service.login({ email: user.email, password: 'pw' }, { origin });

describe('AuthService: which tenant a sign-in lands in', () => {
  it('signs the doctor into the clinic whose subdomain they are on, not the default one', async () => {
    const { service, tenantContext, tokens } = build();
    // The SPA on medlife.doctor.<apex> bootstraps Medlife and sends it as
    // X-Tenant-Id; the resolver middleware puts it in the request context.
    const res = await tenantContext.run({ tenantId: MEDLIFE }, () =>
      login(service, 'https://medlife.doctor.medview.test'),
    );
    expect(res.user.tenantId).toBe(MEDLIFE);
    expect(tokens.issue).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      [Role.DOCTOR],
      MEDLIFE,
      null,
      undefined,
      undefined,
    );
  });

  it('falls back to the default membership when the request names a clinic the user is not in', async () => {
    const { service, tenantContext } = build();
    // Default is Harmony, which requires its own subdomain — and the Origin
    // is some other host, so the policy of the DEFAULT tenant still applies.
    await expect(
      tenantContext.run({ tenantId: OTHER }, () => login(service, 'https://other.doctor.medview.test')),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: 'auth.subdomain_required' },
    });
  });

  it('uses the default membership when there is no request context at all', async () => {
    const { service } = build();
    const res = await login(service, 'https://harmony.doctor.medview.test');
    expect(res.user.tenantId).toBe(HARMONY);
  });

  it('keeps the refreshed session in the clinic the SPA is on', async () => {
    const { service, tenantContext } = build();
    const res = await tenantContext.run({ tenantId: MEDLIFE }, () => service.refresh('refresh-token'));
    expect(res.user.tenantId).toBe(MEDLIFE);
    expect(res.user.roles).toEqual([Role.DOCTOR]);
  });
});
