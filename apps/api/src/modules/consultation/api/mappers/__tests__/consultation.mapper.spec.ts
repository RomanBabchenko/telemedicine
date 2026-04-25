import { ConsultationStatus } from '@telemed/shared-types';
import { toConsultationSessionResponse } from '../consultation.mapper';

const buildSession = () =>
  ({
    id: 's-1',
    appointmentId: 'a-1',
    livekitRoomName: 'room-a-1',
    status: ConsultationStatus.ACTIVE,
    startedAt: new Date('2026-05-01T10:02:00.000Z'),
    endedAt: null,
    patientJoinedAt: new Date('2026-05-01T10:00:30.000Z'),
    doctorJoinedAt: new Date('2026-05-01T10:01:45.000Z'),
    recordingId: 'r-1',
  }) as unknown as Parameters<typeof toConsultationSessionResponse>[0];

describe('consultation mapper', () => {
  it('converts all dates to ISO strings and preserves nulls', () => {
    const dto = toConsultationSessionResponse(buildSession());
    expect(dto.startedAt).toBe('2026-05-01T10:02:00.000Z');
    expect(dto.endedAt).toBeNull();
    expect(dto.patientJoinedAt).toBe('2026-05-01T10:00:30.000Z');
    expect(dto.doctorJoinedAt).toBe('2026-05-01T10:01:45.000Z');
  });

  it('passes recordingId through unchanged', () => {
    const dto = toConsultationSessionResponse(buildSession());
    expect(dto.recordingId).toBe('r-1');
  });
});
