import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { ApiKeyGuard } from '../../../common/auth/api-key.guard';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { SyncJobService } from '../application/sync-job.service';
import { ConnectorRegistry } from '../application/connector.registry';
import { WebhookEventHandler } from '../application/webhook-event.handler';
import {
  MisAppointmentLocator,
  MisAppointmentService,
} from '../application/mis-appointment.service';
import { OnlineAppointmentPayload } from '../domain/ports/mis-connector';
import { TenantService } from '../../tenant/application/tenant.service';
import { RecordingInfoResponseDto } from '../../recording/api/dto';
import {
  CancelAppointmentBodyDto,
  CancelAppointmentResponseDto,
  PaymentStatusResponseDto,
  RevokeInvitesBodyDto,
  RevokeInvitesResponseDto,
  SubmitAppointmentBodyDto,
  SyncJobResponseDto,
  UpdatePaymentStatusBodyDto,
} from './dto';

const connectorIdFromRequest = (req: Request): string => {
  const apiKey = (req as Request & { apiKey?: { connectorId: string } }).apiKey;
  if (!apiKey?.connectorId) {
    // ApiKeyGuard always populates req.apiKey — reaching here means a wiring bug.
    throw new BadRequestException('API key connector could not be resolved');
  }
  return apiKey.connectorId;
};

const externalLocator = (
  externalAppointmentId: string,
  req: Request,
): MisAppointmentLocator => ({
  kind: 'external',
  externalAppointmentId,
  connectorId: connectorIdFromRequest(req),
});

@ApiTags('mis-integration')
@Controller('integrations')
export class MisController {
  constructor(
    private readonly sync: SyncJobService,
    private readonly registry: ConnectorRegistry,
    private readonly webhookHandler: WebhookEventHandler,
    private readonly tenants: TenantService,
    private readonly appointments: MisAppointmentService,
  ) {}

  @Post(':tenantId/sync/full')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'mis.sync.full', resource: 'MisSyncJob' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Trigger a full sync for the tenant',
    operationId: 'misFullSync',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiOkResponse({ type: SyncJobResponseDto })
  @ApiStandardErrors()
  async fullSync(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ): Promise<SyncJobResponseDto> {
    const job = await this.sync.runFullSync(tenantId);
    return { ok: true, jobId: job.id, stats: job.stats, status: job.status };
  }

  @Post(':tenantId/sync/incremental')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'mis.sync.incremental', resource: 'MisSyncJob' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Trigger an incremental sync for the tenant',
    operationId: 'misIncrementalSync',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiOkResponse({ type: SyncJobResponseDto })
  @ApiStandardErrors()
  async incrementalSync(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
  ): Promise<SyncJobResponseDto> {
    const job = await this.sync.runIncrementalSync(tenantId);
    return { ok: true, jobId: job.id, stats: job.stats, status: job.status };
  }

  @Get(':tenantId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Fetch the latest sync job status for the tenant',
    operationId: 'misSyncStatus',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiStandardErrors()
  status(@Param('tenantId', new ParseUUIDPipe()) tenantId: string) {
    return this.sync.status(tenantId);
  }

  @Get(':tenantId/errors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'List recent sync errors for the tenant',
    operationId: 'misSyncErrors',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiStandardErrors()
  errors(@Param('tenantId', new ParseUUIDPipe()) tenantId: string) {
    return this.sync.listErrors(tenantId);
  }

  @Post(':tenantId/appointments')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.appointment.submitted', resource: 'MisSyncJob' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'MIS → telemed: create / reissue an online appointment',
    description:
      "Authenticated via integration API key. The connector (e.g. 'docdream') is derived from the API key itself so the URL stays brand-agnostic. Body shape is documented as the DocDream payload below; other connectors may accept a different shape — the request is parsed by ConnectorRegistry.parseWebhookEvent at runtime.",
    operationId: 'misSubmitAppointment',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiBody({ type: SubmitAppointmentBodyDto })
  @ApiStandardErrors()
  async submitAppointment(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    await this.tenants.getOrThrow(tenantId);
    const connectorId = connectorIdFromRequest(req);

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

  @Patch(':tenantId/appointments/:appointmentId/payment-status')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.payment.updated', resource: 'Appointment' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Mark an MIS-prepaid appointment as paid/unpaid (by internal id)',
    description:
      "When transitioning 'paid' from AWAITING_PAYMENT, the appointment is also moved to CONFIRMED — which unblocks the patient's video join token.",
    operationId: 'misUpdatePaymentStatusById',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiBody({ type: UpdatePaymentStatusBodyDto })
  @ApiOkResponse({ type: PaymentStatusResponseDto })
  @ApiStandardErrors()
  async updatePaymentStatus(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: UpdatePaymentStatusBodyDto,
  ): Promise<PaymentStatusResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.markPaymentStatus(
      tenantId,
      { kind: 'internal', appointmentId },
      body.paymentStatus,
    );
  }

  @Patch(':tenantId/appointments/by-external/:externalAppointmentId/payment-status')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.payment.updated', resource: 'Appointment' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: "Mark an MIS-prepaid appointment as paid/unpaid (by the MIS's own externalAppointmentId)",
    description: "DocDream doesn't always persist our internal appointmentId — this variant accepts the id the MIS already knows.",
    operationId: 'misUpdatePaymentStatusByExternal',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'externalAppointmentId' })
  @ApiBody({ type: UpdatePaymentStatusBodyDto })
  @ApiOkResponse({ type: PaymentStatusResponseDto })
  @ApiStandardErrors()
  async updatePaymentStatusByExternal(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Body() body: UpdatePaymentStatusBodyDto,
    @Req() req: Request,
  ): Promise<PaymentStatusResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.markPaymentStatus(
      tenantId,
      externalLocator(externalAppointmentId, req),
      body.paymentStatus,
    );
  }

  @Get(':tenantId/appointments/:appointmentId/recording')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.recording.requested', resource: 'SessionRecording' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Fetch the MP3 recording metadata + signed download URL (by internal id)',
    operationId: 'misGetAppointmentRecording',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiOkResponse({ type: RecordingInfoResponseDto })
  @ApiStandardErrors()
  async getAppointmentRecording(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ): Promise<RecordingInfoResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.getRecording(tenantId, { kind: 'internal', appointmentId });
  }

  @Get(':tenantId/appointments/by-external/:externalAppointmentId/recording')
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.recording.requested', resource: 'SessionRecording' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Fetch the MP3 recording metadata + signed download URL (by external id)',
    operationId: 'misGetAppointmentRecordingByExternal',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'externalAppointmentId' })
  @ApiOkResponse({ type: RecordingInfoResponseDto })
  @ApiStandardErrors()
  async getAppointmentRecordingByExternal(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Req() req: Request,
  ): Promise<RecordingInfoResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.getRecording(tenantId, externalLocator(externalAppointmentId, req));
  }

  @Post(':tenantId/appointments/:appointmentId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.appointment.cancelled', resource: 'Appointment' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Cancel an appointment and revoke invites (by internal id)',
    operationId: 'misCancelAppointment',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiBody({ type: CancelAppointmentBodyDto })
  @ApiOkResponse({ type: CancelAppointmentResponseDto })
  @ApiStandardErrors()
  async cancelAppointment(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: CancelAppointmentBodyDto,
  ): Promise<CancelAppointmentResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.cancel(tenantId, { kind: 'internal', appointmentId }, body.reason);
  }

  @Post(':tenantId/appointments/by-external/:externalAppointmentId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.appointment.cancelled', resource: 'Appointment' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Cancel an appointment and revoke invites (by external id)',
    operationId: 'misCancelAppointmentByExternal',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'externalAppointmentId' })
  @ApiBody({ type: CancelAppointmentBodyDto })
  @ApiOkResponse({ type: CancelAppointmentResponseDto })
  @ApiStandardErrors()
  async cancelAppointmentByExternal(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Body() body: CancelAppointmentBodyDto,
    @Req() req: Request,
  ): Promise<CancelAppointmentResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.cancel(
      tenantId,
      externalLocator(externalAppointmentId, req),
      body.reason,
    );
  }

  @Post(':tenantId/appointments/:appointmentId/invites/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.invites.revoked', resource: 'ConsultationInvite' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Revoke outstanding invite links for an appointment (by internal id)',
    description: 'Use role to scope revocation to one participant (PATIENT or DOCTOR); otherwise both are revoked.',
    operationId: 'misRevokeInvites',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiBody({ type: RevokeInvitesBodyDto })
  @ApiOkResponse({ type: RevokeInvitesResponseDto })
  @ApiStandardErrors()
  async revokeInvites(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: RevokeInvitesBodyDto,
  ): Promise<RevokeInvitesResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.revokeInvites(
      tenantId,
      { kind: 'internal', appointmentId },
      body.role,
    );
  }

  @Post(':tenantId/appointments/by-external/:externalAppointmentId/invites/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @Auditable({ action: 'mis.invites.revoked', resource: 'ConsultationInvite' })
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Revoke outstanding invite links for an appointment (by external id)',
    operationId: 'misRevokeInvitesByExternal',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'externalAppointmentId' })
  @ApiBody({ type: RevokeInvitesBodyDto })
  @ApiOkResponse({ type: RevokeInvitesResponseDto })
  @ApiStandardErrors()
  async revokeInvitesByExternal(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('externalAppointmentId') externalAppointmentId: string,
    @Body() body: RevokeInvitesBodyDto,
    @Req() req: Request,
  ): Promise<RevokeInvitesResponseDto> {
    await this.tenants.getOrThrow(tenantId);
    return this.appointments.revokeInvites(
      tenantId,
      externalLocator(externalAppointmentId, req),
      body.role,
    );
  }
}
