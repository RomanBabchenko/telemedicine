import { ForbiddenException } from '@nestjs/common';
import {
  AppointmentStatus,
  ConsultationStatus,
  DEFAULT_RECORDING_NOTICE_TEXT,
  RECORDING_DECLINED_REASON,
  Role,
} from '@telemed/shared-types';
import { ConsultationService } from '../consultation.service';
import type { AuthUser } from '../../../../common/auth/decorators';
import type { ConsultationSession } from '../../domain/entities/consultation-session.entity';
import type { Tenant } from '../../../tenant/domain/entities/tenant.entity';

const doctor = { id: 'u-doc', roles: [Role.DOCTOR], scope: 'full' } as unknown as AuthUser;
const patient = { id: 'u-pat', roles: [Role.PATIENT], scope: 'full' } as unknown as AuthUser;
const anonPatient = {
  id: 'inv-1',
  roles: [Role.PATIENT],
  scope: 'invite-anon',
} as unknown as AuthUser;

function makeService(opts?: {
  tenant?: Partial<Tenant>;
  recordingOff?: boolean;
  appointmentStatus?: AppointmentStatus;
  session?: Partial<ConsultationSession>;
}) {
  const session = {
    id: 's-1',
    tenantId: 't-1',
    appointmentId: 'a-1',
    livekitRoomName: 'room-a-1',
    status: ConsultationStatus.SCHEDULED,
    doctorJoinedAt: null,
    patientJoinedAt: null,
    doctorRecordingNoticeAt: null,
    patientRecordingNoticeAt: null,
    recordingId: null,
    ...opts?.session,
  } as ConsultationSession;
  const now = Date.now();
  const appointment = {
    id: 'a-1',
    status: opts?.appointmentStatus ?? AppointmentStatus.CONFIRMED,
    startAt: new Date(now),
    endAt: new Date(now + 30 * 60_000),
    misPaymentType: null,
    misPaymentStatus: null,
  };
  const tenant = {
    id: 't-1',
    websiteUrl: null,
    consultationPolicy: {},
    ...opts?.tenant,
  } as Tenant;

  const sessions = {
    findOne: jest.fn(async () => session),
    save: jest.fn(async (s: ConsultationSession) => s),
  };
  const events = { create: (e: unknown) => e, save: jest.fn(async () => undefined) };
  const appointments = { findOne: jest.fn(async () => appointment) };
  const tenants = { findOne: jest.fn(async () => tenant) };
  const livekit = {
    deleteRoom: jest.fn(async () => undefined),
    issueToken: jest.fn(async () => ({ token: 'tok', expiresAt: new Date(now + 3600_000) })),
    publicUrl: 'wss://lk',
  };
  const tenantContext = { getTenantId: () => 't-1' };
  const appointmentService = {
    cancel: jest.fn(async () => undefined),
    complete: jest.fn(async () => undefined),
    start: jest.fn(async () => undefined),
  };
  const recording = {
    recordingDisabledReason: jest.fn(() => (opts?.recordingOff ? 'off' : null)),
    stop: jest.fn(async () => undefined),
    startAuto: jest.fn(async () => null),
    isRecordingActive: jest.fn(async () => true),
  };

  const service = new ConsultationService(
    sessions as never,
    events as never,
    appointments as never,
    tenants as never,
    livekit as never,
    tenantContext as never,
    appointmentService as never,
    recording as never,
  );
  return { service, session, sessions, events, appointmentService, livekit, recording };
}

describe('ConsultationService — recording notice', () => {
  describe('getRecordingNotice', () => {
    it('returns the default text and no link when nothing is configured', async () => {
      const { service } = makeService();
      await expect(service.getRecordingNotice()).resolves.toEqual({
        text: DEFAULT_RECORDING_NOTICE_TEXT,
        linkUrl: null,
        linkLabel: null,
      });
    });

    it('uses the clinic text and prefers the offer URL over the website', async () => {
      const { service } = makeService({
        tenant: {
          websiteUrl: 'https://clinic.example',
          consultationPolicy: {
            recordingNoticeText: 'Свій текст',
            offerUrl: 'https://clinic.example/oferta',
          },
        },
      });
      await expect(service.getRecordingNotice()).resolves.toEqual({
        text: 'Свій текст',
        linkUrl: 'https://clinic.example/oferta',
        linkLabel: 'Договір публічної оферти',
      });
    });

    it('falls back to the clinic website when no offer URL is set', async () => {
      const { service } = makeService({ tenant: { websiteUrl: 'https://clinic.example' } });
      const notice = await service.getRecordingNotice();
      expect(notice?.linkUrl).toBe('https://clinic.example');
      expect(notice?.linkLabel).toBe('Сайт клініки');
    });

    it('is null when the clinic switched the notice off', async () => {
      const { service } = makeService({
        tenant: { consultationPolicy: { recordingNoticeEnabled: false } },
      });
      await expect(service.getRecordingNotice()).resolves.toBeNull();
    });

    it('is null when recording is off for the clinic', async () => {
      const { service } = makeService({ recordingOff: true });
      await expect(service.getRecordingNotice()).resolves.toBeNull();
    });
  });

  describe('respondToRecordingNotice', () => {
    it('accepted stamps the caller side only and logs an event', async () => {
      const { service, session, events } = makeService();
      await service.respondToRecordingNotice('s-1', patient, 'accepted');
      expect(session.patientRecordingNoticeAt).toBeInstanceOf(Date);
      expect(session.doctorRecordingNoticeAt).toBeNull();
      expect(events.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECORDING_NOTICE_ACCEPTED', actorUserId: 'u-pat' }),
      );
    });

    it('patient decline cancels as CANCELLED_BY_PATIENT and closes the room', async () => {
      const { service, session, appointmentService, livekit, recording } = makeService();
      await service.respondToRecordingNotice('s-1', patient, 'declined');
      expect(appointmentService.cancel).toHaveBeenCalledWith(
        'a-1',
        true,
        RECORDING_DECLINED_REASON,
      );
      expect(session.status).toBe(ConsultationStatus.ENDED);
      expect(recording.stop).toHaveBeenCalledWith('s-1');
      expect(livekit.deleteRoom).toHaveBeenCalledWith('room-a-1');
    });

    it('doctor decline cancels on behalf of the provider', async () => {
      const { service, appointmentService } = makeService();
      await service.respondToRecordingNotice('s-1', doctor, 'declined');
      expect(appointmentService.cancel).toHaveBeenCalledWith(
        'a-1',
        false,
        RECORDING_DECLINED_REASON,
      );
    });

    it('anonymous decline does not write the invite pseudonym as actor', async () => {
      const { service, events } = makeService();
      await service.respondToRecordingNotice('s-1', anonPatient, 'declined');
      expect(events.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECORDING_NOTICE_DECLINED', actorUserId: null }),
      );
    });

    it('decline on an IN_PROGRESS appointment ends it instead of cancelling', async () => {
      const { service, appointmentService, livekit } = makeService({
        appointmentStatus: AppointmentStatus.IN_PROGRESS,
      });
      await service.respondToRecordingNotice('s-1', patient, 'declined');
      expect(appointmentService.cancel).not.toHaveBeenCalled();
      expect(appointmentService.complete).toHaveBeenCalledWith('a-1');
      expect(livekit.deleteRoom).toHaveBeenCalled();
    });

    it('decline on a terminal appointment is a no-op', async () => {
      const { service, appointmentService, livekit } = makeService({
        appointmentStatus: AppointmentStatus.CANCELLED_BY_PROVIDER,
      });
      await service.respondToRecordingNotice('s-1', patient, 'declined');
      expect(appointmentService.cancel).not.toHaveBeenCalled();
      expect(livekit.deleteRoom).not.toHaveBeenCalled();
    });
  });

  describe('isRecordingActive', () => {
    it('reflects the recording row while the session is live', async () => {
      const { service, session, recording } = makeService();
      await expect(service.isRecordingActive(session)).resolves.toBe(true);
      expect(recording.isRecordingActive).toHaveBeenCalledWith('s-1');
    });

    it('is false once the session ended, even before egress finalises', async () => {
      const { service, session, recording } = makeService({
        session: { status: ConsultationStatus.ENDED },
      });
      await expect(service.isRecordingActive(session)).resolves.toBe(false);
      expect(recording.isRecordingActive).not.toHaveBeenCalled();
    });
  });

  describe('issueJoinToken gate', () => {
    it('refuses a token until the caller accepted the notice', async () => {
      const { service } = makeService();
      await expect(service.issueJoinToken('s-1', patient)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.issueJoinToken('s-1', patient)).rejects.toMatchObject({
        response: { code: 'consultation.recording_notice_required' },
      });
    });

    it('issues a token once the caller accepted', async () => {
      const { service } = makeService({ session: { patientRecordingNoticeAt: new Date() } });
      await expect(service.issueJoinToken('s-1', patient)).resolves.toMatchObject({ token: 'tok' });
    });

    it("the other side's acceptance does not count", async () => {
      const { service } = makeService({ session: { patientRecordingNoticeAt: new Date() } });
      await expect(service.issueJoinToken('s-1', doctor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('does not gate when there is no notice', async () => {
      const { service } = makeService({ recordingOff: true });
      await expect(service.issueJoinToken('s-1', doctor)).resolves.toMatchObject({ token: 'tok' });
    });
  });
});
