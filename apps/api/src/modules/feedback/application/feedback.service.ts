import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { AppointmentStatus, ConsultationStatus, Role } from '@telemed/shared-types';
import type { SubmitFeedbackDto } from '@telemed/shared-types';
import { AuthUser } from '../../../common/auth/decorators';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppointmentService } from '../../booking/application/appointment.service';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { ConsultationSession } from '../../consultation/domain/entities/consultation-session.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import {
  AppointmentFeedback,
  FeedbackSubmittedScope,
} from '../domain/entities/appointment-feedback.entity';

// Appointment statuses that mean "the consultation is over" from the
// patient's point of view. COMPLETED is what ConsultationService.end sets;
// the DOCUMENTATION_* pair is kept for forward-compat with the (currently
// unreachable) follow-up transition.
const ENDED_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DOCUMENTATION_PENDING,
  AppointmentStatus.DOCUMENTATION_COMPLETED,
]);

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(AppointmentFeedback)
    private readonly feedbacks: Repository<AppointmentFeedback>,
    @InjectRepository(ConsultationSession)
    private readonly sessions: Repository<ConsultationSession>,
    @InjectRepository(Patient)
    private readonly patients: Repository<Patient>,
    private readonly appointments: AppointmentService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Record the patient's answers for an appointment. Exactly one answer per
   * appointment — a repeat lands as 409 so the UI can show "thank you"
   * instead of an error.
   */
  async submit(
    appointmentId: string,
    user: AuthUser,
    body: SubmitFeedbackDto,
  ): Promise<AppointmentFeedback> {
    const appt = await this.appointments.getById(appointmentId);
    await this.assertCallerIsPatient(appt, user);
    await this.assertConsultationEnded(appt);

    const existing = await this.feedbacks.findOne({ where: { appointmentId: appt.id } });
    if (existing) throw FeedbackService.alreadySubmitted();

    const isAnon = user.scope === 'invite-anon';
    const submittedScope: FeedbackSubmittedScope =
      user.scope === 'invite' ? 'invite' : isAnon ? 'invite-anon' : 'full';
    const row = this.feedbacks.create({
      tenantId: this.tenantContext.getTenantId(),
      appointmentId: appt.id,
      consultationSessionId: appt.consultationSessionId,
      doctorId: appt.doctorId,
      patientId: appt.patientId,
      resolved: body.resolved,
      clarityRating: body.clarityRating,
      // invite-anon: user.id is a ConsultationInvite pseudonym, not users(id).
      submittedByUserId: isAnon ? null : user.id,
      submittedScope,
      submittedAt: new Date(),
    });
    try {
      return await this.feedbacks.save(row);
    } catch (e) {
      // Double-click / two tabs racing past the findOne above — the unique
      // index is the real idempotency guard.
      if (e instanceof QueryFailedError && FeedbackService.isUniqueViolation(e)) {
        throw FeedbackService.alreadySubmitted();
      }
      throw e;
    }
  }

  async findByAppointmentId(appointmentId: string): Promise<AppointmentFeedback | null> {
    const tenantId = this.tenantContext.getTenantId();
    return this.feedbacks.findOne({ where: { appointmentId, tenantId } });
  }

  // One batched lookup for list decoration (admin table).
  async findByAppointmentIds(appointmentIds: string[]): Promise<Map<string, AppointmentFeedback>> {
    if (appointmentIds.length === 0) return new Map();
    const rows = await this.feedbacks.find({ where: { appointmentId: In(appointmentIds) } });
    return new Map(rows.map((r) => [r.appointmentId, r]));
  }

  // Only the patient of THIS appointment may answer. Invite holders were
  // already pinned to the appointment by JwtAuthGuard (@InviteAccessible);
  // re-assert here so the service is safe on its own. Full-scope patients
  // must own the Patient row; doctors/admins are rejected outright.
  private async assertCallerIsPatient(appt: Appointment, user: AuthUser): Promise<void> {
    if (user.scope === 'invite' || user.scope === 'invite-anon') {
      if (user.inviteCtx?.appointmentId !== appt.id) {
        throw new ForbiddenException({
          message: 'Оцінку може залишити лише пацієнт цієї консультації.',
          code: 'feedback.not_patient',
        });
      }
      return;
    }
    if (!user.roles.includes(Role.PATIENT)) {
      throw new ForbiddenException({
        message: 'Оцінку може залишити лише пацієнт цієї консультації.',
        code: 'feedback.not_patient',
      });
    }
    const patient = await this.patients.findOne({ where: { userId: user.id } });
    if (!patient || !appt.patientId || patient.id !== appt.patientId) {
      throw new ForbiddenException({
        message: 'Оцінку може залишити лише пацієнт цієї консультації.',
        code: 'feedback.not_patient',
      });
    }
  }

  // ConsultationService.end flips the session to ENDED *before* it marks the
  // appointment COMPLETED (and the latter is best-effort), so either signal
  // counts as "the doctor has ended the call".
  private async assertConsultationEnded(appt: Appointment): Promise<void> {
    if (ENDED_APPOINTMENT_STATUSES.has(appt.status)) return;
    if (appt.consultationSessionId) {
      const session = await this.sessions.findOne({
        where: { id: appt.consultationSessionId },
        select: ['id', 'status'],
      });
      if (session?.status === ConsultationStatus.ENDED) return;
    }
    throw new ConflictException({
      message: 'Консультацію ще не завершено — оцінку можна залишити після її закінчення.',
      code: 'feedback.consultation_not_ended',
    });
  }

  private static alreadySubmitted(): ConflictException {
    return new ConflictException({
      message: 'Оцінку для цієї консультації вже надіслано.',
      code: 'feedback.already_submitted',
    });
  }

  private static isUniqueViolation(e: QueryFailedError): boolean {
    const code =
      (e as QueryFailedError & { code?: string }).code ??
      (e.driverError as { code?: string } | undefined)?.code;
    return code === PG_UNIQUE_VIOLATION;
  }
}
