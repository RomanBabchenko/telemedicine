import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppointmentStatus, SlotStatus } from '@telemed/shared-types';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { Slot } from '../../booking/domain/entities/slot.entity';
import { AppointmentService } from '../../booking/application/appointment.service';
import { RecordingService } from '../../recording/application/recording.service';
import { RecordingInfoResponseDto } from '../../recording/api/dto';
import { ExternalIdentity } from '../domain/entities/external-identity.entity';
import { ConsultationInviteService } from './consultation-invite.service';
import { CancelAppointmentResponseDto } from '../api/dto/cancel-appointment.response.dto';
import { PaymentStatusResponseDto } from '../api/dto/payment-status.response.dto';
import { RescheduleAppointmentResponseDto } from '../api/dto/reschedule-appointment.response.dto';
import { RevokeInvitesResponseDto } from '../api/dto/revoke-invites.response.dto';

/**
 * Locator for the two ways MIS connectors address an appointment:
 *   - `internal`: our own UUID (used when the MIS stored it).
 *   - `external`: the MIS's own id + the connector that owns it (used when the
 *     MIS doesn't persist our UUID and references its own one instead).
 */
export type MisAppointmentLocator =
  | { kind: 'internal'; appointmentId: string }
  | { kind: 'external'; externalAppointmentId: string; connectorId: string };

/**
 * Application service for MIS-facing appointment workflows. Pulled out of
 * MisController so the controller stays a thin HTTP adapter — the logic for
 * resolving appointments, applying payment status, cancelling and revoking
 * invites lives here with the repositories it needs.
 */
@Injectable()
export class MisAppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(ExternalIdentity)
    private readonly externalIds: Repository<ExternalIdentity>,
    @InjectRepository(Slot)
    private readonly slots: Repository<Slot>,
    private readonly appointmentService: AppointmentService,
    private readonly recordings: RecordingService,
    private readonly invites: ConsultationInviteService,
    private readonly dataSource: DataSource,
  ) {}

  async resolveAppointment(
    tenantId: string,
    locator: MisAppointmentLocator,
  ): Promise<Appointment> {
    if (locator.kind === 'internal') {
      const appt = await this.appointments.findOne({
        where: { id: locator.appointmentId, tenantId },
      });
      if (!appt) throw new NotFoundException('Appointment not found');
      return appt;
    }
    const mapping = await this.externalIds.findOne({
      where: {
        tenantId,
        externalSystem: locator.connectorId,
        entityType: 'APPOINTMENT',
        externalId: locator.externalAppointmentId,
      },
    });
    if (!mapping) {
      throw new NotFoundException(
        `No appointment found for externalAppointmentId="${locator.externalAppointmentId}" in connector "${locator.connectorId}".`,
      );
    }
    const appt = await this.appointments.findOne({
      where: { id: mapping.internalId, tenantId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  /**
   * Apply a MIS-driven payment status. When flipping to 'paid' from
   * AWAITING_PAYMENT the appointment is transitioned to CONFIRMED — which
   * unblocks the patient's join token.
   */
  async markPaymentStatus(
    tenantId: string,
    locator: MisAppointmentLocator,
    paymentStatus: 'paid' | 'unpaid',
  ): Promise<PaymentStatusResponseDto> {
    const appointment = await this.resolveAppointment(tenantId, locator);
    if (appointment.misPaymentType !== 'prepaid') {
      throw new BadRequestException(
        'Appointment is not MIS-prepaid — nothing to update.',
      );
    }

    const wasHeldUnpaid = appointment.status === AppointmentStatus.AWAITING_PAYMENT;

    appointment.misPaymentStatus = paymentStatus;
    await this.appointments.save(appointment);

    if (paymentStatus === 'paid' && wasHeldUnpaid) {
      await this.appointmentService.confirm(appointment.id);
    }

    return {
      ok: true,
      appointmentId: appointment.id,
      misPaymentStatus: paymentStatus,
      status:
        paymentStatus === 'paid' && wasHeldUnpaid
          ? AppointmentStatus.CONFIRMED
          : appointment.status,
    };
  }

  /**
   * MIS-driven reschedule. The MIS owns slot scheduling, so we accept new
   * times rather than a slot id and find/create a matching MIS slot on our
   * side (mirrors the create-appointment webhook). Then:
   *
   *   1. AppointmentService.reschedule swaps the appointment to the new slot
   *      under pessimistic locks and emits AppointmentRescheduledEvent.
   *   2. Existing invite tokens stay valid — that is the whole point of
   *      reschedule vs cancel+recreate. We only push their `expiresAt`
   *      forward to match the new endAt, otherwise a link issued for the
   *      old time would die before the new meeting.
   *
   * The status is preserved end-to-end: a CONFIRMED appointment stays
   * CONFIRMED at the new time, an AWAITING_PAYMENT one stays awaiting.
   */
  async reschedule(
    tenantId: string,
    locator: MisAppointmentLocator,
    newStartAt: Date,
    newEndAt: Date,
    reason: string | undefined,
    connectorId: string,
  ): Promise<RescheduleAppointmentResponseDto> {
    const appt = await this.resolveAppointment(tenantId, locator);

    if (newEndAt.getTime() <= newStartAt.getTime()) {
      throw new BadRequestException('endAt must be after startAt');
    }

    // Find or create a slot for the new time. Mirrors the webhook handler's
    // slot-find-or-create: same (tenantId, doctorId, startAt) lookup, same
    // BOOKED + sourceIsMis stamp on creation. Done in its own transaction
    // so the heavy reschedule lock acquisition below is short.
    const newSlot = await this.dataSource.transaction(async (em) => {
      const slotRepo = em.getRepository(Slot);
      const existing = await slotRepo.findOne({
        where: { tenantId, doctorId: appt.doctorId, startAt: newStartAt },
      });
      if (existing) return existing;
      return slotRepo.save(
        slotRepo.create({
          tenantId,
          doctorId: appt.doctorId,
          serviceTypeId: appt.serviceTypeId,
          startAt: newStartAt,
          endAt: newEndAt,
          status: SlotStatus.BOOKED,
          sourceIsMis: true,
          // No stable external slot id from MIS for the new time — namespace
          // by connector + appointment so it stays unique without colliding
          // with future MIS-imported slots.
          externalSlotId: `reschedule-${connectorId}-${appt.id}-${Date.now()}`,
        }),
      );
    });

    await this.appointmentService.reschedule(appt.id, newSlot.id, reason);

    const invitesUpdated = await this.invites.extendForAppointment(
      tenantId,
      appt.id,
      newEndAt,
    );

    // Re-read so the response reflects the post-reschedule state without
    // hand-mirroring fields.
    const updated = await this.resolveAppointment(tenantId, locator);

    return {
      ok: true,
      appointmentId: updated.id,
      status: updated.status,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt.toISOString(),
      invitesUpdated,
    };
  }

  /**
   * Provider-side cancellation initiated by MIS — transitions the appointment
   * to CANCELLED_BY_PROVIDER and revokes every outstanding invite for it so a
   * leaked URL can't be reused.
   */
  async cancel(
    tenantId: string,
    locator: MisAppointmentLocator,
    reason: string | undefined,
  ): Promise<CancelAppointmentResponseDto> {
    const appt = await this.resolveAppointment(tenantId, locator);
    const updated = await this.appointmentService.cancel(appt.id, false, reason);
    const invitesRevoked = await this.invites.revokeForAppointment(tenantId, appt.id);
    return {
      ok: true,
      appointmentId: appt.id,
      status: updated.status,
      cancelledReason: updated.cancelledReason,
      invitesRevoked,
    };
  }

  async getRecording(
    tenantId: string,
    locator: MisAppointmentLocator,
  ): Promise<RecordingInfoResponseDto> {
    const appt = await this.resolveAppointment(tenantId, locator);
    if (!appt.consultationSessionId) {
      throw new NotFoundException('Consultation session not yet created');
    }
    const info = await this.recordings.getRecordingInfo(appt.consultationSessionId);
    if (!info) throw new NotFoundException('Recording not found');
    return info;
  }

  async revokeInvites(
    tenantId: string,
    locator: MisAppointmentLocator,
    role: 'PATIENT' | 'DOCTOR' | undefined,
  ): Promise<RevokeInvitesResponseDto> {
    const appt = await this.resolveAppointment(tenantId, locator);
    const revoked = await this.invites.revokeForAppointment(tenantId, appt.id, role);
    return { ok: true, appointmentId: appt.id, revoked };
  }
}
