import { AppointmentStatus, ConsultationStatus } from '@telemed/shared-types';
import { ConsultationService, FORCE_END_AFTER_END_MS } from '../consultation.service';
import type { ConsultationSession } from '../../domain/entities/consultation-session.entity';

const END_AT = new Date('2026-09-26T10:30:00Z');
// Join window closed (endAt + 30 min) but still before the 2 h force cap.
const AFTER_WINDOW = new Date('2026-09-26T11:10:00Z');
const AFTER_CAP = new Date(END_AT.getTime() + FORCE_END_AFTER_END_MS + 60_000);

function makeService(opts?: {
  session?: Partial<ConsultationSession>;
  appointmentStatus?: AppointmentStatus;
  identities?: string[];
  egress?: { inflight: boolean; lastEndedAt: Date | null };
  lastEventAt?: Date | null;
}) {
  const session = {
    id: 's-1',
    tenantId: 't-1',
    appointmentId: 'a-1',
    livekitRoomName: 'room-a-1',
    status: ConsultationStatus.ACTIVE,
    startedAt: new Date('2026-09-26T10:01:00Z'),
    endedAt: null,
    endReason: null,
    recordingId: 'r-1',
    ...opts?.session,
  } as ConsultationSession;
  const appointment = {
    id: 'a-1',
    status: opts?.appointmentStatus ?? AppointmentStatus.IN_PROGRESS,
    endAt: END_AT,
  };
  const sessions = {
    findOne: jest.fn(async () => session),
    save: jest.fn(async (s: ConsultationSession) => s),
  };
  const lastEvent =
    opts?.lastEventAt === undefined
      ? { createdAt: new Date('2026-09-26T10:20:00Z') }
      : opts.lastEventAt && { createdAt: opts.lastEventAt };
  const events = {
    create: (e: unknown) => e,
    save: jest.fn(async () => undefined),
    findOne: jest.fn(async () => lastEvent),
  };
  const appointments = { findOne: jest.fn(async () => appointment) };
  const livekit = {
    listParticipantIdentities: jest.fn(async () => opts?.identities ?? []),
    deleteRoom: jest.fn(async () => undefined),
  };
  const tenantContext = {
    getTenantId: () => 't-1',
    run: jest.fn((_ctx: { tenantId: string }, fn: () => unknown) => fn()),
  };
  const appointmentService = { complete: jest.fn(async () => undefined) };
  const recording = {
    stop: jest.fn(async () => null),
    egressActivity: jest.fn(
      async () =>
        opts?.egress ?? { inflight: false, lastEndedAt: new Date('2026-09-26T10:25:00Z') },
    ),
  };
  const service = new ConsultationService(
    sessions as never,
    events as never,
    appointments as never,
    {} as never,
    livekit as never,
    tenantContext as never,
    appointmentService as never,
    recording as never,
  );
  return {
    service,
    session,
    sessions,
    events,
    livekit,
    appointmentService,
    recording,
    tenantContext,
  };
}

describe('ConsultationService.end — idempotent', () => {
  it('ends with the given reason and endedAt, closes the room, completes', async () => {
    const { service, session, livekit, appointmentService, recording } = makeService();
    const endedAt = new Date('2026-09-26T10:25:00Z');
    await service.end('s-1', { reason: 'AUTO_TIMEOUT', endedAt });
    expect(session.status).toBe(ConsultationStatus.ENDED);
    expect(session.endedAt).toBe(endedAt);
    expect(session.endReason).toBe('AUTO_TIMEOUT');
    expect(recording.stop).toHaveBeenCalledWith('s-1');
    expect(livekit.deleteRoom).toHaveBeenCalledWith('room-a-1');
    expect(appointmentService.complete).toHaveBeenCalledWith('a-1');
  });

  it('defaults the reason to DOCTOR', async () => {
    const { service, session } = makeService();
    await service.end('s-1');
    expect(session.endReason).toBe('DOCTOR');
  });

  it('a second call keeps endedAt/endReason and only retries completion', async () => {
    const endedAt = new Date('2026-09-26T10:25:00Z');
    const { service, session, livekit, appointmentService } = makeService({
      session: { status: ConsultationStatus.ENDED, endedAt, endReason: 'DOCTOR' },
    });
    await service.end('s-1', { reason: 'AUTO_TIMEOUT' });
    expect(session.endedAt).toBe(endedAt);
    expect(session.endReason).toBe('DOCTOR');
    expect(livekit.deleteRoom).not.toHaveBeenCalled();
    expect(appointmentService.complete).toHaveBeenCalledWith('a-1');
  });
});

describe('ConsultationService.autoEndIfAbandoned', () => {
  it('ends an empty, silent session with AUTO_TIMEOUT at the last activity', async () => {
    const { service, session, events, appointmentService } = makeService();
    await expect(service.autoEndIfAbandoned('s-1', AFTER_WINDOW)).resolves.toBe('ended');
    expect(session.endReason).toBe('AUTO_TIMEOUT');
    // max(egress 10:25, last event 10:20, startedAt 10:01)
    expect(session.endedAt).toEqual(new Date('2026-09-26T10:25:00Z'));
    expect(appointmentService.complete).toHaveBeenCalledWith('a-1');
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'AUTO_ENDED',
        actorUserId: null,
        payload: expect.objectContaining({ forced: false }),
      }),
    );
  });

  it('falls back to startedAt when there is no other activity', async () => {
    const { service, session } = makeService({
      egress: { inflight: false, lastEndedAt: null },
      lastEventAt: null,
    });
    await service.autoEndIfAbandoned('s-1', AFTER_WINDOW);
    expect(session.endedAt).toEqual(new Date('2026-09-26T10:01:00Z'));
  });

  it('waits while someone is still in the room', async () => {
    const { service, session, appointmentService } = makeService({ identities: ['patient-u1'] });
    await expect(service.autoEndIfAbandoned('s-1', AFTER_WINDOW)).resolves.toBe('occupied');
    expect(session.status).toBe(ConsultationStatus.ACTIVE);
    expect(appointmentService.complete).not.toHaveBeenCalled();
  });

  it('waits while audio is still being recorded', async () => {
    const { service, appointmentService } = makeService({
      egress: { inflight: true, lastEndedAt: null },
    });
    await expect(service.autoEndIfAbandoned('s-1', AFTER_WINDOW)).resolves.toBe('recording');
    expect(appointmentService.complete).not.toHaveBeenCalled();
  });

  it('forces the end past endAt + 2h even if the room is occupied and recording', async () => {
    const { service, session, events } = makeService({
      identities: ['doctor-u1'],
      egress: { inflight: true, lastEndedAt: null },
    });
    await expect(service.autoEndIfAbandoned('s-1', AFTER_CAP)).resolves.toBe('ended');
    expect(session.endReason).toBe('AUTO_TIMEOUT');
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'AUTO_ENDED',
        payload: expect.objectContaining({ forced: true }),
      }),
    );
  });

  it('heals an ENDED session whose appointment is still IN_PROGRESS', async () => {
    const endedAt = new Date('2026-09-26T10:25:00Z');
    const { service, session, appointmentService } = makeService({
      session: { status: ConsultationStatus.ENDED, endedAt, endReason: 'DOCTOR' },
    });
    await expect(service.autoEndIfAbandoned('s-1', AFTER_WINDOW)).resolves.toBe('healed');
    expect(session.endedAt).toBe(endedAt);
    expect(appointmentService.complete).toHaveBeenCalledWith('a-1');
  });

  it('leaves appointments that are no longer IN_PROGRESS alone', async () => {
    const { service, appointmentService } = makeService({
      appointmentStatus: AppointmentStatus.COMPLETED,
    });
    await expect(service.autoEndIfAbandoned('s-1', AFTER_WINDOW)).resolves.toBe('not_in_progress');
    expect(appointmentService.complete).not.toHaveBeenCalled();
  });
});

describe('ConsultationService.recordParticipantLeft', () => {
  const LEFT_AT = new Date('2026-09-26T10:24:00Z');

  it('writes a LEAVE event in the session tenant, actor from the identity', async () => {
    const { service, sessions, events, tenantContext } = makeService();
    await service.recordParticipantLeft('room-a-1', 'doctor-u-doc', LEFT_AT);
    expect(sessions.findOne).toHaveBeenCalledWith({ where: { livekitRoomName: 'room-a-1' } });
    expect(tenantContext.run).toHaveBeenCalledWith({ tenantId: 't-1' }, expect.any(Function));
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEAVE',
        sessionId: 's-1',
        actorUserId: 'u-doc',
        payload: expect.objectContaining({
          identity: 'doctor-u-doc',
          leftAt: LEFT_AT.toISOString(),
        }),
      }),
    );
  });

  it('never stores the anonymous invite pseudonym as actor', async () => {
    const { service, events } = makeService();
    await service.recordParticipantLeft('room-a-1', 'patient-anon-inv-1', LEFT_AT);
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEAVE',
        actorUserId: null,
        payload: expect.objectContaining({ anonymous: true }),
      }),
    );
  });

  it('ignores rooms that are not consultation sessions', async () => {
    const { service, sessions, events } = makeService();
    sessions.findOne.mockResolvedValueOnce(null as never);
    await service.recordParticipantLeft('some-other-room', 'doctor-x', LEFT_AT);
    expect(events.save).not.toHaveBeenCalled();
  });
});
