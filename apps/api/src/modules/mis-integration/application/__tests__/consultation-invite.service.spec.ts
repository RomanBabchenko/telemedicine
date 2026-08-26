import { createHash } from 'node:crypto';
import { IsNull } from 'typeorm';
import { ConsultationInviteService } from '../consultation-invite.service';

// Mirrors INVITE_EXPIRY_GRACE_MS in the SUT — kept inline so the test breaks
// loudly if the grace constant is changed without a deliberate test update.
const GRACE_MS = 30 * 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('ConsultationInviteService.issue', () => {
  const issueParams = {
    tenantId: 't-1',
    appointmentId: 'a-1',
    consultationSessionId: 's-1',
    userId: 'u-1',
    role: 'PATIENT' as const,
    appointmentEndAt: new Date('2026-05-01T12:00:00.000Z'),
  };

  const build = () => {
    const createMock = jest.fn().mockImplementation((row) => row);
    const saveMock = jest.fn().mockImplementation((row) => Promise.resolve(row));
    const service = new ConsultationInviteService({
      create: createMock,
      save: saveMock,
    } as never);
    return { service, createMock };
  };

  it('returns a short SMS-friendly base62 code', async () => {
    const { service } = build();
    const token = await service.issue(issueParams);
    expect(token).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it('stores only the sha256 of the code, never the code itself', async () => {
    const { service, createMock } = build();
    const token = await service.issue(issueParams);
    const row = createMock.mock.calls[0][0] as { tokenHash: string };
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.tokenHash).not.toBe(token);
  });

  it('consume() is format-agnostic — legacy 64-hex tokens still resolve', async () => {
    const legacyToken = 'ab'.repeat(32); // shape of pre-short-link tokens
    const invite = {
      id: 'i-1',
      tenantId: 't-1',
      userId: 'u-1',
      role: 'PATIENT',
      appointmentId: 'a-1',
      consultationSessionId: 's-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };
    const findOneMock = jest.fn().mockResolvedValue(invite);
    const service = new ConsultationInviteService({
      findOne: findOneMock,
      save: jest.fn().mockResolvedValue(invite),
    } as never);

    const result = await service.consume(legacyToken);

    expect(findOneMock).toHaveBeenCalledWith({
      where: { tokenHash: sha256(legacyToken) },
    });
    expect(result).toMatchObject({ inviteId: 'i-1', appointmentId: 'a-1' });
  });
});

describe('ConsultationInviteService.extendForAppointment', () => {
  let service: ConsultationInviteService;
  let updateMock: jest.Mock;

  beforeEach(() => {
    updateMock = jest.fn().mockResolvedValue({ affected: 2 });
    service = new ConsultationInviteService({ update: updateMock } as never);
  });

  it('pushes expiresAt to newEndAt + grace for active invites of the appointment', async () => {
    const newEndAt = new Date('2026-05-01T12:00:00.000Z');

    const updated = await service.extendForAppointment('t-1', 'a-1', newEndAt);

    expect(updated).toBe(2);
    expect(updateMock).toHaveBeenCalledWith(
      { tenantId: 't-1', appointmentId: 'a-1', revokedAt: IsNull() },
      { expiresAt: new Date(newEndAt.getTime() + GRACE_MS) },
    );
  });

  it('returns 0 when no active invites match', async () => {
    updateMock.mockResolvedValueOnce({ affected: 0 });
    const updated = await service.extendForAppointment(
      't-1',
      'a-1',
      new Date('2026-05-01T12:00:00.000Z'),
    );
    expect(updated).toBe(0);
  });

  it('only touches non-revoked rows (revokedAt: IsNull)', async () => {
    await service.extendForAppointment('t-1', 'a-1', new Date('2026-05-01T12:00:00.000Z'));
    const where = updateMock.mock.calls[0][0];
    // We rely on this filter to prevent reviving an invite that the MIS had
    // already cancelled — guard the intent at the test level.
    expect(where.revokedAt).toEqual(IsNull());
  });
});
