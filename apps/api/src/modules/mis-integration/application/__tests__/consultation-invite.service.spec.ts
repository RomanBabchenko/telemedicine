import { IsNull } from 'typeorm';
import { ConsultationInviteService } from '../consultation-invite.service';

// Mirrors INVITE_EXPIRY_GRACE_MS in the SUT — kept inline so the test breaks
// loudly if the grace constant is changed without a deliberate test update.
const GRACE_MS = 30 * 60 * 1000;

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
