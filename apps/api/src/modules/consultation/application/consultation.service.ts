import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationStatus, ParticipantRole, Role } from '@telemed/shared-types';
import { ConsultationSession } from '../domain/entities/consultation-session.entity';
import { SessionEvent, SessionEventType } from '../domain/entities/session-event.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { LiveKitClientService } from '../../../infrastructure/livekit/livekit-client.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppointmentService } from '../../booking/application/appointment.service';
import { RecordingService } from '../../recording/application/recording.service';
import { AuthUser } from '../../../common/auth/decorators';

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
