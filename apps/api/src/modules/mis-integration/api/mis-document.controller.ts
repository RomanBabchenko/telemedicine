import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@telemed/shared-types';
import { Auditable } from '../../../common/audit/decorators';
import { AuthUser, CurrentUser, InviteAccessible, Roles } from '../../../common/auth/decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { MisDocumentRelayService } from '../application/mis-document-relay.service';
import { UploadMisDocumentBodyDto } from './dto/upload-mis-document.body.dto';
import { UploadMisDocumentResponseDto } from './dto/upload-mis-document.response.dto';

/**
 * Patient-facing side of the MIS document flow. Lives under /appointments
 * (not /integrations) because the caller is the patient's own session —
 * either a full login or the invite-scoped JWT from the MIS invite link.
 * No @RequireFeature: the stored upload URL is the feature switch.
 */
@ApiTags('mis-integration')
@Controller()
@UseGuards(RolesGuard)
@ApiAuth()
export class MisDocumentController {
  constructor(private readonly relay: MisDocumentRelayService) {}

  @Post('appointments/:id/mis-documents')
  @HttpCode(HttpStatus.OK)
  // Invite / invite-anon tokens pass only when `:id` equals their
  // inviteCtx.appointmentId (checked by JwtAuthGuard).
  @InviteAccessible('appointmentId')
  @Roles(Role.PATIENT)
  // Per-IP cap well under the global one: each call can carry ~13 MB.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  // No captureBody — the audit row must never hold the base64 payload.
  @Auditable({ action: 'mis.document.relayed', resource: 'Appointment' })
  @ApiOperation({
    summary: 'Relay a patient document to the MIS upload URL of this appointment',
    description:
      'Forwards the file (base64 JSON) to the per-appointment URL the MIS supplied at creation. Nothing is stored. ' +
      '409 mis_upload.not_configured when the appointment has no upload URL; 502 mis_upload.rejected / 504 mis_upload.unreachable when the MIS endpoint fails. ' +
      'Body limit on this route is 15 MB (10 MiB decoded).',
    operationId: 'uploadMisDocument',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiBody({ type: UploadMisDocumentBodyDto })
  @ApiOkResponse({ type: UploadMisDocumentResponseDto })
  @ApiStandardErrors()
  upload(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UploadMisDocumentBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UploadMisDocumentResponseDto> {
    return this.relay.relay(id, user, body);
  }
}
