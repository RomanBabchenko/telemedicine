import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AppointmentStatus,
  ConsultationStatus,
  ParticipantRole,
  Role,
} from '@telemed/shared-types';
import { ConsultationSession } from '../domain/entities/consultation-session.entity';
import { SessionEvent, SessionEventType } from '../domain/entities/session-event.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { LiveKitClientService } from '../../../infrastructure/livekit/livekit-client.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppointmentService } from '../../booking/application/appointment.service';
import { RecordingService } from '../../recording/application/recording.service';
import { AuthUser } from '../../../common/auth/decorators';

// Join is allowed from 15 min before startAt to 30 min after endAt.
// Same window for doctor and patient: early enough for mic/camera check,
// generous enough for late arrivals and reconnects.
const JOIN_OPENS_BEFORE_START_MS = 15 * 60 * 1000;
const JOIN_CLOSES_AFTER_END_MS = 30 * 60 * 1000;

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
    // joins. We check this before the time-gate so the user gets an accurate
    // error ("cancelled") rather than a misleading one ("meeting is over").
    if (TERMINAL_APPOINTMENT_STATUSES.has(appointment.status)) {
      throw new ForbiddenException(
        'Зустріч скасовано або завершено — підключення недоступне.',
      );
    }

    // Time-gate — the invite link may live for a week, but the video room
    // only opens around the scheduled slot. This is the real security
    // boundary; the frontend waiting-room UI is just UX.
    const now = Date.now();
    const opensAt = appointment.startAt.getTime() - JOIN_OPENS_BEFORE_START_MS;
    const closesAt = appointment.endAt.getTime() + JOIN_CLOSES_AFTER_END_MS;
    if (now < opensAt) {
      const minutesUntil = Math.ceil((opensAt - now) / 60_000);
      throw new ForbiddenException(
        `До початку зустрічі ще ${minutesUntil} хв. Повертайтесь ближче до ${formatHM(appointment.startAt)}.`,
      );
    }
    if (now > closesAt) {
      throw new ForbiddenException(
        'Зустріч завершено — підключення недоступне.',
      );
    }

    // MIS prepaid gate — block patient join until the clinic confirms payment
    // via PATCH /integrations/:tenantId/appointments/:id/payment-status. Doctors
    // are never blocked — they run the session regardless of billing.
    if (
      !isDoctor &&
      appointment.misPaymentType === 'prepaid' &&
      appointment.misPaymentStatus !== 'paid'
    ) {
      throw new ForbiddenException(
        'Оплату не завершено. Будь ласка, зверніться до клініки для завершення оплати.',
      );
    }

    const identity = `${isDoctor ? 'doctor' : 'patient'}-${user.id}`;
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
      // Auto-start audio recording
      try {
        await this.recording.startAuto(session.id);
      } catch (e) {
        this.logger.warn(`Auto-recording failed for session ${session.id}: ${(e as Error).message}`);
      }
    } else if (session.status === ConsultationStatus.SCHEDULED) {
      session.status = ConsultationStatus.WAITING;
    }
    await this.sessions.save(session);
    await this.recordEvent(session.id, 'JOIN', user.id, { identity });

    return {
      token,
      livekitUrl: this.livekit.publicUrl,
      roomName: session.livekitRoomName,
      identity,
      expiresAt: expiresAt.toISOString(),
    };
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

  async end(sessionId: string): Promise<ConsultationSession> {
    const session = await this.getById(sessionId);
    session.status = ConsultationStatus.ENDED;
    session.endedAt = new Date();
    await this.sessions.save(session);
    // Stop recording before deleting the room
    try {
      await this.recording.stop(sessionId);
    } catch (e) {
      this.logger.warn(`Stop recording failed for session ${sessionId}: ${(e as Error).message}`);
    }
    await this.livekit.deleteRoom(session.livekitRoomName);
    try {
      await this.appointmentService.complete(session.appointmentId);
    } catch {
      // already terminal
    }
    return session;
  }

  async setRecordingId(sessionId: string, recordingId: string | null): Promise<void> {
    await this.sessions.update({ id: sessionId }, { recordingId });
  }
}
