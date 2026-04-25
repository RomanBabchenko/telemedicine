import { AppointmentStatus, ConsultationStatus } from '@telemed/shared-types';
import { Appointment } from '../../../booking/domain/entities/appointment.entity';
import { ConsultationSession } from '../../../consultation/domain/entities/consultation-session.entity';
import { MisAppointmentService } from '../mis-appointment.service';

const makeAppt = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'a-1',
    tenantId: 't-1',
    slotId: 'slot-1',
    doctorId: 'd-1',
    patientId: 'p-1',
    isAnonymousPatient: false,
    serviceTypeId: 'svc-1',
    status: AppointmentStatus.CONFIRMED,
    startAt: new Date('2026-05-01T10:00:00Z'),
    endAt: new Date('2026-05-01T10:30:00Z'),
    cancelledReason: null,
    misPaymentType: null,
    misPaymentStatus: null,
    consultationSessionId: null,
    ...overrides,
  }) as unknown as Appointment;

const buildService = (appt: Appointment, session: ConsultationSession | null) => {
  const apptFindOne = jest.fn().mockResolvedValue(appt);
  const sessionFindOne = jest.fn().mockResolvedValue(session);

  const service = new MisAppointmentService(
    { findOne: apptFindOne } as never, // appointments repo
    {} as never, // externalIds
    {} as never, // slots repo
    { findOne: sessionFindOne } as never, // sessions repo
    {} as never, // appointmentService
    {} as never, // recordings
    {} as never, // invites
    {} as never, // dataSource
  );

  return { service, sessionFindOne };
};

describe('MisAppointmentService.getInfo', () => {
  it('returns scheduled times + null consultation when no session has been created yet', async () => {
    const appt = makeAppt({ consultationSessionId: null });
    const { service, sessionFindOne } = buildService(appt, null);

    const dto = await service.getInfo('t-1', { kind: 'internal', appointmentId: 'a-1' });

    expect(dto).toEqual({
      appointmentId: 'a-1',
      status: AppointmentStatus.CONFIRMED,
      startAt: '2026-05-01T10:00:00.000Z',
      endAt: '2026-05-01T10:30:00.000Z',
      cancelledReason: null,
      isAnonymousPatient: false,
      misPaymentType: null,
      misPaymentStatus: null,
      consultation: null,
    });
    // Don't hit the sessions repo when there's no session id — saves a query.
    expect(sessionFindOne).not.toHaveBeenCalled();
  });

  it('populates the consultation block once a session exists, with ISO dates and null-safe fields', async () => {
    const appt = makeAppt({
      consultationSessionId: 'sess-1',
      misPaymentType: 'prepaid',
      misPaymentStatus: 'paid',
    });
    const session = {
      id: 'sess-1',
      tenantId: 't-1',
      appointmentId: 'a-1',
      livekitRoomName: 'room-a-1',
      status: ConsultationStatus.ENDED,
      startedAt: new Date('2026-05-01T10:01:00Z'),
      endedAt: new Date('2026-05-01T10:24:30Z'),
      patientJoinedAt: new Date('2026-05-01T10:00:30Z'),
      doctorJoinedAt: new Date('2026-05-01T10:01:00Z'),
      recordingId: 'rec-1',
    } as unknown as ConsultationSession;

    const { service } = buildService(appt, session);
    const dto = await service.getInfo('t-1', { kind: 'internal', appointmentId: 'a-1' });

    expect(dto.consultation).toEqual({
      sessionId: 'sess-1',
      status: ConsultationStatus.ENDED,
      startedAt: '2026-05-01T10:01:00.000Z',
      endedAt: '2026-05-01T10:24:30.000Z',
      patientJoinedAt: '2026-05-01T10:00:30.000Z',
      doctorJoinedAt: '2026-05-01T10:01:00.000Z',
      recordingId: 'rec-1',
    });
    expect(dto.misPaymentType).toBe('prepaid');
    expect(dto.misPaymentStatus).toBe('paid');
  });

  it('keeps consultation timestamp fields null when only one party has joined', async () => {
    // Mid-call: patient is in the waiting room, doctor hasn't clicked join yet,
    // so doctorJoinedAt and endedAt are still null. MIS reads this to detect
    // a "patient is waiting alone" scenario.
    const appt = makeAppt({ consultationSessionId: 'sess-2' });
    const session = {
      id: 'sess-2',
      tenantId: 't-1',
      appointmentId: 'a-1',
      livekitRoomName: 'room-a-1',
      status: ConsultationStatus.WAITING,
      startedAt: new Date('2026-05-01T10:00:30Z'),
      endedAt: null,
      patientJoinedAt: new Date('2026-05-01T10:00:30Z'),
      doctorJoinedAt: null,
      recordingId: null,
    } as unknown as ConsultationSession;

    const { service } = buildService(appt, session);
    const dto = await service.getInfo('t-1', { kind: 'internal', appointmentId: 'a-1' });

    expect(dto.consultation).toEqual({
      sessionId: 'sess-2',
      status: ConsultationStatus.WAITING,
      startedAt: '2026-05-01T10:00:30.000Z',
      endedAt: null,
      patientJoinedAt: '2026-05-01T10:00:30.000Z',
      doctorJoinedAt: null,
      recordingId: null,
    });
  });
});
