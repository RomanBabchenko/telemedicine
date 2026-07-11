import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { ConsultationInviteService } from '../application/consultation-invite.service';
import { WebhookEventHandler } from '../application/webhook-event.handler';
import { ReissueInvitesResponseDto } from './dto';
import { RequireFeature } from '../../../common/tenant/decorators';

// Admin-facing invite reissue. The MIS (ApiKey) path lives in MisController;
// this one lets a clinic admin hand out fresh links from web-admin.
@ApiTags('mis-integration')
@Controller('appointments')
@RequireFeature('misSync')
export class AdminInviteController {
  constructor(
    private readonly webhookHandler: WebhookEventHandler,
    private readonly invites: ConsultationInviteService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post(':appointmentId/invites')
  @UseGuards(RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'appointment.invites.reissued', resource: 'Appointment' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Revoke old invite links and issue a fresh patient/doctor pair',
    description:
      'Tenant-scoped: the appointment must belong to the caller tenant. Fails with 409 for appointments in a terminal state (cancelled/completed).',
    operationId: 'reissueAppointmentInvites',
  })
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiOkResponse({ type: ReissueInvitesResponseDto })
  @ApiStandardErrors()
  async reissue(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ): Promise<ReissueInvitesResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    // "New links" semantics: old links stop working the moment new ones exist.
    await this.invites.revokeForAppointment(tenantId, appointmentId);
    const result = await this.webhookHandler.reissueInvites(tenantId, appointmentId);
    return {
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
      patientInviteUrl: result.patientInviteUrl,
      doctorInviteUrl: result.doctorInviteUrl,
    };
  }
}
