import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AppointmentStatus,
  ConsultationStatus,
  DEFAULT_RECORDING_NOTICE_TEXT,
  ParticipantRole,
  RECORDING_DECLINED_REASON,
  Role,
  type ConsultationEndReason,
  type RecordingNoticeDecision,
  type RecordingNoticeDto,
} from '@telemed/shared-types';
import { ConsultationSession } from '../domain/entities/consultation-session.entity';
import { SessionEvent, SessionEventType } from '../domain/entities/session-event.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { Tenant } from '../../tenant/domain/entities/tenant.entity';
import { LiveKitClientService } from '../../../infrastructure/livekit/livekit-client.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppointmentService } from '../../booking/application/appointment.service';
import { RecordingService } from '../../recording/application/recording.service';
import { AuthUser } from '../../../common/auth/decorators';

// Join is allowed from 15 min before startAt to 30 min after endAt.
// Same window for doctor and patient: early enough for mic/camera check,
// generous enough for late arrivals and reconnects.
const JOIN_OPENS_BEFORE_START_MS = 15 * 60 * 1000;
export const JOIN_CLOSES_AFTER_END_MS = 30 * 60 * 1000;

// Past endAt + this, an abandoned session is closed even if someone still
// sits in the room or a track egress is still running.
export const FORCE_END_AFTER_END_MS = 2 * 60 * 60 * 1000;

export type AutoEndResult = 'ended' | 'healed' | 'occupied' | 'recording' | 'not_in_progress';

const TERMINAL_APPOINTMENT_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DOCUMENTATION_COMPLETED,
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.CANCELLED_BY_PROVIDER,
  AppointmentStatus.NO_SHOW_PATIENT,
  AppointmentStatus.NO_SHOW_PROVIDER,
  AppointmentStatus.REFUNDED,
]);

const formatHM = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(
    @InjectRepository(ConsultationSession)
    private readonly sessions: Repository<ConsultationSession>,
    @InjectRepository(SessionEvent) private readonly events: Repository<SessionEvent>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly livekit: LiveKitClientService,
    private readonly tenantContext: TenantContextService,
    private readonly appointmentService: AppointmentService,
    private readonly recording: RecordingService,
  ) {}

  async ensureForAppointment(appointmentId: string): Promise<ConsultationSession> {
    const tenantId = this.tenantContext.getTenantId();
    let session = await this.sessions.findOne({ where: { appointmentId, tenantId } });
    if (session) return session;
    session = this.sessions.create({
      tenantId,
      appointmentId,
      livekitRoomName: `room-${appointmentId}`,
      status: ConsultationStatus.SCHEDULED,
    });
    session = await this.sessions.save(session);
    await this.appointmentService.setConsultationSessionId(appointmentId, session.id);
    await this.livekit.createRoomIfNotExists(session.livekitRoomName);
    return session;
  }

  async getById(id: string): Promise<ConsultationSession> {
    const tenantId = this.tenantContext.getTenantId();
    const s = await this.sessions.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  /**
   * Returns who is currently in the LiveKit room based on the identity
   * prefix scheme used in issueJoinToken: `doctor-...`, `patient-...`,
   * `patient-anon-...`. Used by the lobby UIs to show online indicators
   * before they themselves connect to the room.
   */
  async getPresence(roomName: string): Promise<{
    doctorPresent: boolean;
    patientPresent: boolean;
  }> {
    const identities = await this.livekit.listParticipantIdentities(roomName);
    let doctorPresent = false;
    let patientPresent = false;
    for (const id of identities) {
      if (id.startsWith('doctor-')) doctorPresent = true;
      else if (id.startsWith('patient-')) patientPresent = true;
    }
    return { doctorPresent, patientPresent };
  }

  /**
   * The recording notice for this tenant, or null when there's nothing to
   * warn about: the clinic switched the notice off, or recording itself is
   * off (audioArchive module / audioPolicy) — the text claims the call IS
   * recorded, so it must never show when it isn't.
   */
  async getRecordingNotice(): Promise<RecordingNoticeDto | null> {
    const tenant = await this.tenants.findOne({
      where: { id: this.tenantContext.getTenantId() },
    });
    if (!tenant) return null;
    if (tenant.consultationPolicy?.recordingNoticeEnabled === false) return null;
    if (this.recording.recordingDisabledReason(tenant) !== null) return null;
    const offerUrl = tenant.consultationPolicy?.offerUrl ?? null;
    const websiteUrl = tenant.websiteUrl ?? null;
    return {
      text: tenant.consultationPolicy?.recordingNoticeText || DEFAULT_RECORDING_NOTICE_TEXT,
      linkUrl: offerUrl ?? websiteUrl,
      linkLabel: offerUrl ? 'Договір публічної оферти' : websiteUrl ? 'Сайт клініки' : null,
    };
  }

  /** Audio recording is running for this (not yet ended) session. */
  async isRecordingActive(session: ConsultationSession): Promise<boolean> {
    if (session.status === ConsultationStatus.ENDED) return false;
    return this.recording.isRecordingActive(session.id);
  }

  /**
   * Doctor or patient answers the recording notice. Accept is remembered on
   * the session so reconnects don't ask again. Decline is terminal: the
   * appointment is cancelled on behalf of whoever declined (reason
   * RECORDING_DECLINED_REASON) and the room is closed, which kicks the other
   * side out to their cancelled screen.
   */
  async respondToRecordingNotice(
    sessionId: string,
    user: AuthUser,
    decision: RecordingNoticeDecision,
  ): Promise<ConsultationSession> {
    const session = await this.getById(sessionId);
    const isDoctor = user.roles.includes(Role.DOCTOR);
    const isAnonPatient = !isDoctor && user.scope === 'invite-anon';
    const actorUserId = isAnonPatient ? null : user.id;
    const payload = { role: isDoctor ? 'doctor' : 'patient' };

    if (decision === 'accepted') {
      if (isDoctor) session.doctorRecordingNoticeAt ??= new Date();
      else session.patientRecordingNoticeAt ??= new Date();
      await this.sessions.save(session);
      await this.recordEvent(session.id, 'RECORDING_NOTICE_ACCEPTED', actorUserId, payload);
      return session;
    }

    const appointment = await this.appointments.findOne({
      where: { id: session.appointmentId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    await this.recordEvent(session.id, 'RECORDING_NOTICE_DECLINED', actorUserId, payload);
    if (TERMINAL_APPOINTMENT_STATUSES.has(appointment.status)) return session;

    if (appointment.status === AppointmentStatus.IN_PROGRESS) {
      // Both sides already talked (the notice was switched on mid-session),
      // and IN_PROGRESS can't be cancelled — finish it the normal way.
      return this.end(sessionId, { reason: 'RECORDING_DECLINED' });
    }
    await this.appointmentService.cancel(appointment.id, !isDoctor, RECORDING_DECLINED_REASON);
    session.status = ConsultationStatus.ENDED;
    session.endedAt = new Date();
    session.endReason = 'RECORDING_DECLINED';
    await this.sessions.save(session);
    await this.closeRoom(session);
    return session;
  }

  async issueJoinToken(sessionId: string, user: AuthUser): Promise<{
    token: string;
    livekitUrl: string;
    roomName: string;
    identity: string;
    expiresAt: string;
  }> {
    const session = await this.getById(sessionId);
    const isDoctor = user.roles.includes(Role.DOCTOR);

    const appointment = await this.appointments.findOne({
      where: { id: session.appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Terminal-state gate — a completed/cancelled appointment is over, no more
    // joins. Checked before the time-gate so the user gets an accurate error
    // ("cancelled") rather than a misleading one ("meeting is over").
    // The machine-readable `code` lets frontends branch without parsing the
    // localised message; the Ukrainian text is preserved for current UX.
    if (TERMINAL_APPOINTMENT_STATUSES.has(appointment.status)) {
      throw new ForbiddenException({
        message: 'Зустріч скасовано або завершено — підключення недоступне.',
        code: 'consultation.terminal',
      });
    }

    // Time-gate — the invite link may live for a week, but the video room
    // only opens around the scheduled slot. This is the real security
    // boundary; the frontend waiting-room UI is just UX.
    const now = Date.now();
    const opensAt = appointment.startAt.getTime() - JOIN_OPENS_BEFORE_START_MS;
    const closesAt = appointment.endAt.getTime() + JOIN_CLOSES_AFTER_END_MS;
    if (now < opensAt) {
      const minutesUntil = Math.ceil((opensAt - now) / 60_000);
      throw new ForbiddenException({
        message: `До початку зустрічі ще ${minutesUntil} хв. Повертайтесь ближче до ${formatHM(appointment.startAt)}.`,
        code: 'consultation.not_yet_open',
        details: {
          minutesUntil,
          opensAt: new Date(opensAt).toISOString(),
          startAt: appointment.startAt.toISOString(),
        },
      });
    }
    if (now > closesAt) {
      throw new ForbiddenException({
        message: 'Зустріч завершено — підключення недоступне.',
        code: 'consultation.meeting_over',
      });
    }

    // MIS prepaid gate — block patient join until the clinic confirms payment
    // via PATCH /integrations/:tenantId/appointments/:id/payment-status. Doctors
    // are never blocked — they run the session regardless of billing.
    if (
      !isDoctor &&
      appointment.misPaymentType === 'prepaid' &&
      appointment.misPaymentStatus !== 'paid'
    ) {
      throw new ForbiddenException({
        message: 'Оплату не завершено. Будь ласка, зверніться до клініки для завершення оплати.',
        code: 'consultation.mis_payment_pending',
      });
    }

    // Recording-notice gate — each side must have accepted the clinic's
    // recording notice (POST /sessions/:id/recording-notice) before joining.
    const notice = await this.getRecordingNotice();
    const noticeAcceptedAt = isDoctor
      ? session.doctorRecordingNoticeAt
      : session.patientRecordingNoticeAt;
    if (notice && !noticeAcceptedAt) {
      throw new ForbiddenException({
        message: 'Підтвердіть попередження про аудіозапис консультації.',
        code: 'consultation.recording_notice_required',
      });
    }

    // Anonymous-patient invites carry user.id = ConsultationInvite.id (a
    // pseudonym). Prefix the LiveKit identity so the doctor UI / audit can
    // tell anonymous participants from named users at a glance, and so a
    // revoke+reissue (new invite.id) produces a distinct identity.
    const isAnonPatient = !isDoctor && user.scope === 'invite-anon';
    const identity = isDoctor
      ? `doctor-${user.id}`
      : isAnonPatient
        ? `patient-anon-${user.id}`
        : `patient-${user.id}`;
    const { token, expiresAt } = await this.livekit.issueToken({
      roomName: session.livekitRoomName,
      identity,
      name: `${isDoctor ? 'Лікар' : 'Пацієнт'}`,
      isDoctor,
      ttlSeconds: 3600,
    });

    if (isDoctor && !session.doctorJoinedAt) {
      session.doctorJoinedAt = new Date();
    } else if (!isDoctor && !session.patientJoinedAt) {
      session.patientJoinedAt = new Date();
    }
    if (session.patientJoinedAt && session.doctorJoinedAt && session.status !== ConsultationStatus.ACTIVE) {
      session.status = ConsultationStatus.ACTIVE;
      session.startedAt = session.startedAt ?? new Date();
      // Move appointment forward
      try {
        await this.appointmentService.start(session.appointmentId);
      } catch {
        // already in progress
      }
      // Auto-start audio recording (no-op when the clinic has it switched off).
      // NB: startAuto loads its own copy of `session` and writes
      // session.recordingId itself. We must sync that value back into THIS
      // function's `session` object — otherwise the `sessions.save(session)`
      // a few lines down overwrites the recordingId with the stale null,
      // and the track_published webhook for the doctor that fires moments
      // later sees session.recordingId=null and skips starting his egress.
      try {
        const recording = await this.recording.startAuto(session.id);
        if (recording) session.recordingId = recording.id;
      } catch (e) {
        this.logger.warn(`Auto-recording failed for session ${session.id}: ${(e as Error).message}`);
      }
    } else if (session.status === ConsultationStatus.SCHEDULED) {
      session.status = ConsultationStatus.WAITING;
    }
    await this.sessions.save(session);
    // session_events.actor_user_id joins to users(id); for anonymous invites
    // user.id is the invite pseudonym and must NOT land there. Store null
    // and keep the pseudonym in the payload for forensics.
    const actorUserId = isAnonPatient ? null : user.id;
    const eventPayload = isAnonPatient
      ? { identity, anonymous: true, inviteId: user.id }
      : { identity };
    await this.recordEvent(session.id, 'JOIN', actorUserId, eventPayload);

    return {
      token,
      livekitUrl: this.livekit.publicUrl,
      roomName: session.livekitRoomName,
      identity,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * LiveKit `participant_left` → LEAVE session event. Webhooks carry no
   * tenant, so the session is looked up by its (unique) room name and the
   * event is written inside that session's tenant context. Identities follow
   * issueJoinToken's scheme; anonymous invite pseudonyms must not land in
   * actor_user_id (FK to users), same rule as for JOIN.
   */
  async recordParticipantLeft(roomName: string, identity: string, leftAt: Date): Promise<void> {
    const session = await this.sessions.findOne({ where: { livekitRoomName: roomName } });
    if (!session) return;
    const isAnon = identity.startsWith('patient-anon-');
    const actorUserId = isAnon ? null : identity.replace(/^(doctor|patient)-/, '') || null;
    await this.tenantContext.run({ tenantId: session.tenantId }, () =>
      this.recordEvent(session.id, 'LEAVE', actorUserId, {
        identity,
        leftAt: leftAt.toISOString(),
        ...(isAnon ? { anonymous: true } : {}),
      }),
    );
  }

  async recordEvent(
    sessionId: string,
    type: SessionEventType,
    actorUserId: string | null,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    await this.events.save(
      this.events.create({
        tenantId,
        sessionId,
        type,
        actorUserId,
        payload,
      }),
    );
  }

  /**
   * Ends the session (room closed, recording stopped) and completes the
   * appointment. Idempotent: an already ENDED session keeps its endedAt /
   * endReason; only the appointment completion is retried, which heals a
   * session whose earlier completion failed.
   */
  async end(
    sessionId: string,
    opts: { reason?: ConsultationEndReason; endedAt?: Date } = {},
  ): Promise<ConsultationSession> {
    const session = await this.getById(sessionId);
    if (session.status !== ConsultationStatus.ENDED) {
      session.status = ConsultationStatus.ENDED;
      session.endedAt = opts.endedAt ?? new Date();
      session.endReason = opts.reason ?? 'DOCTOR';
      await this.sessions.save(session);
      await this.closeRoom(session);
    }
    try {
      await this.appointmentService.complete(session.appointmentId);
    } catch {
      // already terminal
    }
    return session;
  }

  /**
   * Closes a consultation nobody ended (doctor closed the tab, «Відлучитися»,
   * lost connection, docs never submitted). Called by the sweeper for
   * IN_PROGRESS appointments whose join window has closed. Waits while
   * someone is still in the room or audio is still being recorded — until
   * endAt + FORCE_END_AFTER_END_MS, then closes regardless. endedAt is the
   * last observed activity, not the sweep time, so durations stay honest.
   */
  async autoEndIfAbandoned(sessionId: string, now = new Date()): Promise<AutoEndResult> {
    const session = await this.getById(sessionId);
    const appointment = await this.appointments.findOne({
      where: { id: session.appointmentId },
    });
    if (!appointment || appointment.status !== AppointmentStatus.IN_PROGRESS) {
      return 'not_in_progress';
    }
    if (session.status === ConsultationStatus.ENDED) {
      // Ended earlier but the completion step failed — retry it.
      await this.end(sessionId);
      return 'healed';
    }

    const forced = now.getTime() > appointment.endAt.getTime() + FORCE_END_AFTER_END_MS;
    const presence = await this.getPresence(session.livekitRoomName);
    if (!forced && (presence.doctorPresent || presence.patientPresent)) return 'occupied';
    const egress = await this.recording.egressActivity(sessionId);
    if (!forced && egress.inflight) return 'recording';

    const lastEvent = await this.events.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
    const candidates = [egress.lastEndedAt, lastEvent?.createdAt ?? null, session.startedAt]
      .filter((d): d is Date => d instanceof Date)
      .filter((d) => d.getTime() <= now.getTime());
    const lastActivityAt = candidates.length
      ? new Date(Math.max(...candidates.map((d) => d.getTime())))
      : now;

    await this.end(sessionId, { reason: 'AUTO_TIMEOUT', endedAt: lastActivityAt });
    await this.recordEvent(session.id, 'AUTO_ENDED', null, {
      forced,
      lastActivityAt: lastActivityAt.toISOString(),
      ...presence,
      egressInflight: egress.inflight,
    });
    return 'ended';
  }

  // Stops recording before deleting the room; deleting it disconnects everyone.
  private async closeRoom(session: ConsultationSession): Promise<void> {
    try {
      await this.recording.stop(session.id);
    } catch (e) {
      this.logger.warn(`Stop recording failed for session ${session.id}: ${(e as Error).message}`);
    }
    await this.livekit.deleteRoom(session.livekitRoomName);
  }

  async setRecordingId(sessionId: string, recordingId: string | null): Promise<void> {
    await this.sessions.update({ id: sessionId }, { recordingId });
  }
}
