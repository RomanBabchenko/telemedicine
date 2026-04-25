import { Role } from '@telemed/shared-types';
import {
  toMeResponse,
  toUserDetailResponse,
  toUserLookupResponse,
  toUserSummaryResponse,
} from '../user.mapper';

const fixedDate = new Date('2026-01-02T03:04:05.000Z');

const buildUser = () =>
  ({
    id: 'u-1',
    email: 'a@b.test',
    phone: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: 'ACTIVE' as const,
    mfaEnabled: false,
    createdAt: fixedDate,
    // fields @Exclude()-d on the real entity — still present at runtime,
    // mapper must not leak them.
    passwordHash: 'should-not-appear',
    mfaSecret: 'should-not-appear',
  }) as unknown as Parameters<typeof toUserSummaryResponse>[0];

describe('user mapper', () => {
  it('serialises createdAt as ISO string and omits sensitive fields', () => {
    const dto = toUserSummaryResponse(buildUser());
    expect(dto.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).not.toHaveProperty('mfaSecret');
  });

  it('builds a UserLookupResponseDto with the summary nested when user exists', () => {
    const dto = toUserLookupResponse(buildUser());
    expect(dto.exists).toBe(true);
    expect(dto.user?.id).toBe('u-1');
  });

  it('returns { exists: false } with no user field when the user is null', () => {
    const dto = toUserLookupResponse(null);
    expect(dto).toEqual({ exists: false });
  });

  it('produces MeResponseDto with roles + tenantId attached and isostring createdAt absent', () => {
    const dto = toMeResponse(buildUser(), [Role.PATIENT, Role.DOCTOR], 't-1');
    expect(dto.roles).toEqual([Role.PATIENT, Role.DOCTOR]);
    expect(dto.tenantId).toBe('t-1');
    expect(dto).not.toHaveProperty('createdAt');
  });

  it('maps a UserDetail into UserDetailResponseDto with ISO dates on memberships', () => {
    const dto = toUserDetailResponse({
      id: 'u-1',
      email: 'a@b.test',
      phone: null,
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: fixedDate,
      memberships: [
        {
          id: 'm-1',
          userId: 'u-1',
          tenantId: 't-1',
          tenantName: 'Tenant',
          role: Role.PATIENT,
          isDefault: true,
          createdAt: fixedDate,
        },
      ],
    });
    expect(dto.memberships[0].createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(dto.createdAt).toBe('2026-01-02T03:04:05.000Z');
  });
});
