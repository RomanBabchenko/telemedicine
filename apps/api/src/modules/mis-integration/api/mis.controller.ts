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
import { Public, Roles } from '../../../common/auth/decorators';
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
    private readonly appointments: AppointmentService,
  ) {}

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

  @Post(':tenantId/webhook/:connector')
  @Public()
  @Auditable({ action: 'mis.webhook.received', resource: 'MisSyncJob' })
  async webhook(
    @Param('tenantId') tenantId: string,
    @Param('connector') connectorId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.tenants.getOrThrow(tenantId);
    const connector = this.registry.get(connectorId);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }
    if (!connector.verifyWebhookSignature(headers, JSON.stringify(body))) {
      return { received: false };
    }
    const event = connector.parseWebhookEvent(JSON.stringify(body));
    if (!event) return { received: false };

    if (event.type === 'appointment.online') {
      return this.tenantContext.run({ tenantId }, () =>
        this.webhookHandler.handleOnlineAppointment(
          tenantId,
          connectorId,
          event.payload as unknown as OnlineAppointmentPayload,
        ),
      );
    }

    return { received: true, event };
  }

  // Clinic (MIS) server-to-server call to mark an MIS-originated prepaid
  // appointment as paid. On success the appointment is transitioned from
  // AWAITING_PAYMENT → CONFIRMED, which unblocks the patient's join-token.
  @Patch(':tenantId/appointments/:appointmentId/payment-status')
  @Public()
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

    return this.tenantContext.run({ tenantId }, async () => {
      const appt = await this.appointmentsRepo.findOne({
        where: { id: appointmentId, tenantId },
      });
      if (!appt) throw new NotFoundException('Appointment not found');
      if (appt.misPaymentType !== 'prepaid') {
        throw new BadRequestException(
          'Appointment is not MIS-prepaid — nothing to update.',
        );
      }

      appt.misPaymentStatus = body.paymentStatus;
      await this.appointmentsRepo.save(appt);

      // Flip status only when transitioning to 'paid' and currently held.
      if (
        body.paymentStatus === 'paid' &&
        appt.status === AppointmentStatus.AWAITING_PAYMENT
      ) {
        await this.appointments.confirm(appointmentId);
      }

      return {
        ok: true,
        appointmentId,
        misPaymentStatus: body.paymentStatus,
        status:
          body.paymentStatus === 'paid' &&
          appt.status === AppointmentStatus.AWAITING_PAYMENT
            ? AppointmentStatus.CONFIRMED
            : appt.status,
      };
    });
  }
}
