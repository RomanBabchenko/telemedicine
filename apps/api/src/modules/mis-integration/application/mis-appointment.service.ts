import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentStatus } from '@telemed/shared-types';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { AppointmentService } from '../../booking/application/appointment.service';
import { RecordingService } from '../../recording/application/recording.service';
import { RecordingInfoResponseDto } from '../../recording/api/dto';
import { ExternalIdentity } from '../domain/entities/external-identity.entity';
import { ConsultationInviteService } from './consultation-invite.service';
import { CancelAppointmentResponseDto } from '../api/dto/cancel-appointment.response.dto';
import { PaymentStatusResponseDto } from '../api/dto/payment-status.response.dto';
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
    private readonly appointmentService: AppointmentService,
    private readonly recordings: RecordingService,
    private readonly invites: ConsultationInviteService,
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
