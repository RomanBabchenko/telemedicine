import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { AppointmentStatus, Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { ApiKeyGuard } from '../../../common/auth/api-key.guard';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { SyncJobService } from '../application/sync-job.service';
import { ConnectorRegistry } from '../application/connector.registry';
import { WebhookEventHandler } from '../application/webhook-event.handler';
import { OnlineAppointmentPayload } from '../domain/ports/mis-connector';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { AppointmentService } from '../../booking/application/appointment.service';
import { TenantService } from '../../tenant/application/tenant.service';
import { RecordingService } from '../../recording/application/recording.service';
import { ExternalIdentity } from '../domain/entities/external-identity.entity';
import { ConsultationInviteService } from '../application/consultation-invite.service';

@ApiTags('mis-integration')
@Controller('integrations')
export class MisController {
  constructor(
    private readonly sync: SyncJobService,
    private readonly registry: ConnectorRegistry,
    private readonly webhookHandler: WebhookEventHandler,
    private readonly tenantContext: TenantContextService,
    private readonly tenants: TenantService,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(ExternalIdentity)
    private readonly externalIds: Repository<ExternalIdentity>,
    private readonly appointments: AppointmentService,
    private readonly recordings: RecordingService,
    private readonly invites: ConsultationInviteService,
  ) {}

  /**
   * Resolve an appointment by the MIS's externalAppointmentId. The
   * connector is inferred from the API key (one key = one connector), so
   * the caller never passes it explicitly. Throws 404 if not mapped, 400
   * if the guard wiring forgot to attach `req.apiKey`.
   */
  private async resolveAppointmentByExternal(
    tenantId: string,
    externalAppointmentId: string,
    req: Request,
  ): Promise<Appointment> {
    const apiKey = (req as Request & { apiKey?: { connectorId: string } })
      .apiKey;
    if (!apiKey?.connectorId) {
      // ApiKeyGuard always sets this — reaching here means a wiring bug.
      throw new BadRequestException('API key connector could not be resolved');
    }
    const mapping = await this.externalIds.findOne({
      where: {
        tenantId,
        externalSystem: apiKey.connectorId,
        entityType: 'APPOINTMENT',
        externalId: externalAppointmentId,
      },
    });
    if (!mapping) {
      throw new NotFoundException(
        `No appointment found for externalAppointmentId="${externalAppointmentId}" in connector "${apiKey.connectorId}".`,
      );
    }
    const appt = await this.appointmentsRepo.findOne({
      where: { id: mapping.internalId, tenantId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  // Core logic shared by the two payment-status endpoints (by internal id
  // and by external id). Verifies preconditions, persists misPaymentStatus,
  // triggers the CONFIRMED transition when transitioning to 'paid' from
  // AWAITING_PAYMENT. Returns the shape DocDream expects.
  private async applyPaymentStatus(
    tenantId: string,
    appointment: Appointment,
    paymentStatus: 'paid' | 'unpaid',
  ) {
    if (appointment.misPaymentType !== 'prepaid') {
      throw new BadRequestException(
        'Appointment is not MIS-prepaid — nothing to update.',
      );
    }

    const wasHeldUnpaid =
      appointment.status === AppointmentStatus.AWAITING_PAYMENT;

    appointment.misPaymentStatus = paymentStatus;
    await this.appointmentsRepo.save(appointment);

    if (paymentStatus === 'paid' && wasHeldUnpaid) {
      await this.appointments.confirm(appointment.id);
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

  @ApiBearerAuth()
  @Post(':tenantId/sync/full')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'mis.sync.full', resource: 'MisSyncJob' })
  async fullSync(@Param('tenantId') tenantId: string) {
    const job = await this.sync.runFullSync(tenantId);
    return { ok: true, jobId: job.id, stats: job.stats, status: job.status };
  }

  @ApiBearerAuth()
  @Post(':tenantId/sync/incremental')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'mis.sync.incremental', resource: 'MisSyncJob' })
  async incrementalSync(@Param('tenantId') tenantId: string) {
    const job = await this.sync.runIncrementalSync(tenantId);
    return { ok: true, jobId: job.id, stats: job.stats, status: job.status };
  }

  @ApiBearerAuth()
  @Get(':tenantId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  status(@Param('tenantId') tenantId: string) {
    return this.sync.status(tenantId);
  }

  @ApiBearerAuth()
  @Get(':tenantId/errors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  errors(@Param('tenantId') tenantId: string) {
    return this.sync.listErrors(tenantId);
  }

  // MIS → telemed RPC for creating / reissuing an online appointment.
  //
  // Authenticated via integration API key. The connector (e.g. 'docdream')
  // is derived from the API key itself — one key = one connector — so the
  // URL stays brand-agnostic and stable if the partner rebrands.
  @Post(':tenantId/appointments')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.appointment.submitted', resource: 'MisSyncJob' })
  async submitAppointment(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.tenants.getOrThrow(tenantId);

    const apiKey = (req as Request & { apiKey?: { connectorId: string } })
      .apiKey;
    if (!apiKey?.connectorId) {
      throw new BadRequestException('API key connector could not be resolved');
    }
    const connectorId = apiKey.connectorId;

    const connector = this.registry.get(connectorId);
    const event = connector.parseWebhookEvent(JSON.stringify(body));
    if (!event) return { received: false };

    if (event.type === 'appointment.online') {
      return this.webhookHandler.handleOnlineAppointment(
        tenantId,
        connectorId,
        event.payload as unknown as OnlineAppointmentPayload,
      );
    }

    return { received: true, event };
  }

  // Clinic (MIS) server-to-server call to mark an MIS-originated prepaid
  // appointment as paid. On success the appointment is transitioned from
  // AWAITING_PAYMENT → CONFIRMED, which unblocks the patient's join-token.
  @Patch(':tenantId/appointments/:appointmentId/payment-status')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.payment.updated', resource: 'Appointment' })
  async updatePaymentStatus(
    @Param('tenantId') tenantId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { paymentStatus: 'paid' | 'unpaid' },
  ) {
    if (body.paymentStatus !== 'paid' && body.paymentStatus !== 'unpaid') {
      throw new BadRequestException('paymentStatus must be "paid" or "unpaid"');
    }

    await this.tenants.getOrThrow(tenantId);

    const appt = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, tenantId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');

    return this.applyPaymentStatus(tenantId, appt, body.paymentStatus);
  }

  // Same operation as above but keyed by the MIS's own externalAppointmentId.
  // DocDream doesn't always persist our internal appointmentId, so we let
  // them reference the appointment by the ID they already know. Connector is
  // taken from the API key itself (one key = one connector).
  @Patch(':tenantId/appointments/by-external/:externalAppointmentId/payment-status')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.payment.updated', resource: 'Appointment' })
  async updatePaymentStatusByExternal(
    @Param('tenantId') tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Body() body: { paymentStatus: 'paid' | 'unpaid' },
    @Req() req: Request,
  ) {
    if (body.paymentStatus !== 'paid' && body.paymentStatus !== 'unpaid') {
      throw new BadRequestException('paymentStatus must be "paid" or "unpaid"');
    }
    await this.tenants.getOrThrow(tenantId);
    const appt = await this.resolveAppointmentByExternal(
      tenantId,
      externalAppointmentId,
      req,
    );
    return this.applyPaymentStatus(tenantId, appt, body.paymentStatus);
  }

  // DocDream pulls the finished MP3 recording after the consultation ends.
  // Mirrors GET /sessions/:id/recording but keyed by appointmentId (DocDream's
  // domain concept) and guarded by the integration API key.
  @Get(':tenantId/appointments/:appointmentId/recording')
  @UseGuards(ApiKeyGuard)
  @Auditable({
    action: 'mis.recording.requested',
    resource: 'SessionRecording',
  })
  async getAppointmentRecording(
    @Param('tenantId') tenantId: string,
    @Param('appointmentId') appointmentId: string,
  ) {
    await this.tenants.getOrThrow(tenantId);

    const appt = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, tenantId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return this.fetchRecordingFor(appt);
  }

  @Get(':tenantId/appointments/by-external/:externalAppointmentId/recording')
  @UseGuards(ApiKeyGuard)
  @Auditable({
    action: 'mis.recording.requested',
    resource: 'SessionRecording',
  })
  async getAppointmentRecordingByExternal(
    @Param('tenantId') tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Req() req: Request,
  ) {
    await this.tenants.getOrThrow(tenantId);
    const appt = await this.resolveAppointmentByExternal(
      tenantId,
      externalAppointmentId,
      req,
    );
    return this.fetchRecordingFor(appt);
  }

  private async fetchRecordingFor(appt: Appointment) {
    if (!appt.consultationSessionId) {
      throw new NotFoundException('Consultation session not yet created');
    }
    const info = await this.recordings.getRecordingInfo(
      appt.consultationSessionId,
    );
    if (!info) throw new NotFoundException('Recording not found');
    return info;
  }

  // ─────────────────────── Cancel appointment ───────────────────────

  // Provider-side cancellation initiated by MIS. Transitions to
  // CANCELLED_BY_PROVIDER (terminal) AND revokes any outstanding invite
  // links so a leaked URL can't be reused to peek at the appointment.
  private async cancelAppointmentCore(
    tenantId: string,
    appt: Appointment,
    reason: string | undefined,
  ) {
    const updated = await this.appointments.cancel(appt.id, false, reason);
    const invitesRevoked = await this.invites.revokeForAppointment(
      tenantId,
      appt.id,
    );
    return {
      ok: true,
      appointmentId: appt.id,
      status: updated.status,
      cancelledReason: updated.cancelledReason,
      invitesRevoked,
    };
  }

  @Post(':tenantId/appointments/:appointmentId/cancel')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.appointment.cancelled', resource: 'Appointment' })
  async cancelAppointment(
    @Param('tenantId') tenantId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { reason?: string },
  ) {
    await this.tenants.getOrThrow(tenantId);
    const appt = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, tenantId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return this.cancelAppointmentCore(tenantId, appt, body.reason);
  }

  @Post(':tenantId/appointments/by-external/:externalAppointmentId/cancel')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.appointment.cancelled', resource: 'Appointment' })
  async cancelAppointmentByExternal(
    @Param('tenantId') tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Body() body: { reason?: string },
    @Req() req: Request,
  ) {
    await this.tenants.getOrThrow(tenantId);
    const appt = await this.resolveAppointmentByExternal(
      tenantId,
      externalAppointmentId,
      req,
    );
    return this.cancelAppointmentCore(tenantId, appt, body.reason);
  }

  // ─────────────────── Revoke invite links (keep appointment) ───────────────────

  // Used when the appointment must proceed but a specific invite link (or
  // both) must be dead — e.g. the patient's phone was stolen, the SMS was
  // forwarded, etc. Set `role` to scope to only patient or only doctor.
  // To get a fresh link, DocDream re-POSTs the webhook — our idempotent
  // handler reissues new invites for the same appointment.
  @Post(':tenantId/appointments/:appointmentId/invites/revoke')
  @UseGuards(ApiKeyGuard)
  @Auditable({
    action: 'mis.invites.revoked',
    resource: 'ConsultationInvite',
  })
  async revokeInvites(
    @Param('tenantId') tenantId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { role?: 'PATIENT' | 'DOCTOR' },
  ) {
    await this.tenants.getOrThrow(tenantId);
    const appt = await this.appointmentsRepo.findOne({
      where: { id: appointmentId, tenantId },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    const revoked = await this.invites.revokeForAppointment(
      tenantId,
      appt.id,
      body.role,
    );
    return { ok: true, appointmentId: appt.id, revoked };
  }

  @Post(':tenantId/appointments/by-external/:externalAppointmentId/invites/revoke')
  @UseGuards(ApiKeyGuard)
  @Auditable({
    action: 'mis.invites.revoked',
    resource: 'ConsultationInvite',
  })
  async revokeInvitesByExternal(
    @Param('tenantId') tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Body() body: { role?: 'PATIENT' | 'DOCTOR' },
    @Req() req: Request,
  ) {
    await this.tenants.getOrThrow(tenantId);
    const appt = await this.resolveAppointmentByExternal(
      tenantId,
      externalAppointmentId,
      req,
    );
    const revoked = await this.invites.revokeForAppointment(
      tenantId,
      appt.id,
      body.role,
    );
    return { ok: true, appointmentId: appt.id, revoked };
  }
}
