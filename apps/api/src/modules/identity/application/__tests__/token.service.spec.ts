import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token.service';

const DEFAULT_ACCESS_TTL_SEC = 15 * 60;

const build = () => {
  const jwt = new JwtService({});
  const config = {
    jwt: {
      accessSecret: 'access-secret',
      accessTtl: '15m',
      refreshSecret: 'refresh-secret',
      refreshTtl: '30d',
    },
  };
  const sessionRepo = {
    create: jest.fn().mockImplementation((row) => row),
    save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
  };
  const service = new TokenService(jwt, config as never, sessionRepo as never);
  return { service, jwt, sessionRepo };
};

const lifetimeSec = (jwt: JwtService, token: string): number => {
  const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
  return exp - iat;
};

const inviteCtx = { appointmentId: 'a-1', consultationSessionId: 's-1' };

const user = {
  id: 'u-1',
  email: 'doctor@example.com',
  phone: null,
  mfaEnabled: false,
};

describe('TokenService invite TTL', () => {
  // Invite sessions carry no refresh token, so the JWT has to outlive the
  // call: a token clamped to the default TTL logs both sides out mid-call.
  it('anonymous invite token lives for the override, not the default TTL', async () => {
    const { service, jwt } = build();
    const tokens = await service.issueAnonymousInvite({
      tenantId: 't-1',
      inviteCtx,
      anonIdentity: 'i-1',
      accessTtlOverrideSec: 3600,
    });
    expect(tokens.expiresIn).toBe(3600);
    expect(lifetimeSec(jwt, tokens.accessToken)).toBe(3600);
    expect(tokens.refreshToken).toBeNull();
  });

  it('named invite token lives for the override, not the default TTL', async () => {
    const { service, jwt, sessionRepo } = build();
    const tokens = await service.issue(user as never, [], 't-1', null, null, null, {
      scope: 'invite',
      inviteCtx,
      accessTtlOverrideSec: 3600,
      skipRefresh: true,
    });
    expect(tokens.expiresIn).toBe(3600);
    expect(lifetimeSec(jwt, tokens.accessToken)).toBe(3600);
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('never issues an invite token shorter than a minute', async () => {
    const { service, jwt } = build();
    const tokens = await service.issueAnonymousInvite({
      tenantId: 't-1',
      inviteCtx,
      anonIdentity: 'i-1',
      accessTtlOverrideSec: 5,
    });
    expect(lifetimeSec(jwt, tokens.accessToken)).toBe(60);
  });

  it('regular login keeps the default access TTL', async () => {
    const { service, jwt } = build();
    const tokens = await service.issue(user as never, [], 't-1');
    expect(tokens.expiresIn).toBe(DEFAULT_ACCESS_TTL_SEC);
    expect(lifetimeSec(jwt, tokens.accessToken)).toBe(DEFAULT_ACCESS_TTL_SEC);
    expect(tokens.refreshToken).not.toBeNull();
  });
});
