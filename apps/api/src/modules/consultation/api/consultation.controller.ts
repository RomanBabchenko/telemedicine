import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser, InviteAccessible } from '../../../common/auth/decorators';
import { Auditable, AuditViewAccess } from '../../../common/audit/decorators';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { ConsultationService } from '../application/consultation.service';
import { SessionEventType } from '../domain/entities/session-event.entity';
import {
  ConsultationSessionResponseDto,
  JoinTokenResponseDto,
  RecordingNoticeBodyDto,
  SessionEventBodyDto,
} from './dto';
import { toConsultationSessionResponse } from './mappers/consultation.mapper';

@ApiTags('sessions')
@Controller('sessions')
@ApiAuth()
export class ConsultationController {
  constructor(private readonly service: ConsultationService) {}

  @Get(':id')
  @InviteAccessible('consultationSessionId')
  @AuditViewAccess('ConsultationSession')
  @ApiOperation({
    summary: 'Fetch a consultation session',
    description: 'Invite-scoped callers (named or anonymous) may access their own session.',
    operationId: 'getConsultationSession',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ConsultationSessionResponseDto })
  @ApiStandardErrors()
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConsultationSessionResponseDto> {
    const session = await this.service.getById(id);
    const [presence, recordingNotice, recordingActive] = await Promise.all([
      this.service.getPresence(session.livekitRoomName),
      this.service.getRecordingNotice(),
      this.service.isRecordingActive(session),
    ]);
    return toConsultationSessionResponse(session, presence, recordingNotice, recordingActive);
  }

  @Post(':id/recording-notice')
  @HttpCode(HttpStatus.OK)
  @InviteAccessible('consultationSessionId')
  @Auditable({ action: 'session.recording-notice', resource: 'ConsultationSession', captureBody: true })
  @ApiOperation({
    summary: 'Accept or decline the recording notice',
    description:
      "Doctor or patient answers the clinic's audio-recording notice before joining. 'accepted' is stored on the session (join-token requires it while the notice is on). 'declined' cancels the appointment (CANCELLED_BY_PATIENT / CANCELLED_BY_PROVIDER, cancelledReason 'recording_consent_declined') and closes the room; an IN_PROGRESS appointment is ended as COMPLETED instead.",
    operationId: 'respondToRecordingNotice',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: RecordingNoticeBodyDto })
  @ApiOkResponse({ type: ConsultationSessionResponseDto })
  @ApiStandardErrors()
  async recordingNotice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RecordingNoticeBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ConsultationSessionResponseDto> {
    const session = await this.service.respondToRecordingNotice(id, user, body.decision);
    const recordingNotice = await this.service.getRecordingNotice();
    return toConsultationSessionResponse(session, undefined, recordingNotice);
  }

  @Post(':id/join-token')
  @HttpCode(HttpStatus.CREATED)
  @InviteAccessible('consultationSessionId')
  @Auditable({ action: 'session.join-token.issued', resource: 'ConsultationSession' })
  @ApiOperation({
    summary: 'Issue a LiveKit join token for a session',
    description:
      "Four gates apply before a token is issued: (1) terminal-state gate (code 'consultation.terminal'); (2) time-gate — room opens 15 min before start, closes 30 min after end ('consultation.not_yet_open', 'consultation.meeting_over'); (3) MIS prepaid gate for patients ('consultation.mis_payment_pending'); (4) caller has not accepted the recording notice ('consultation.recording_notice_required'). Frontends branch on the ErrorResponseDto.code.",
    operationId: 'issueJoinToken',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: JoinTokenResponseDto })
  @ApiStandardErrors()
  joinToken(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<JoinTokenResponseDto> {
    return this.service.issueJoinToken(id, user);
  }

  @Post(':id/events')
  @HttpCode(HttpStatus.OK)
  @InviteAccessible('consultationSessionId')
  @ApiOperation({
    summary: 'Record a session event',
    description: 'Used by the video UI to log JOIN / LEAVE / RECONNECT / RECORDING_STARTED etc. for audit and analytics.',
    operationId: 'recordSessionEvent',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: SessionEventBodyDto })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  async events(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SessionEventBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OkResponseDto> {
    await this.service.recordEvent(
      id,
      body.type as SessionEventType,
      user.id,
      body.payload ?? {},
    );
    return OkResponseDto.value;
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @InviteAccessible('consultationSessionId')
  @Auditable({ action: 'session.ended', resource: 'ConsultationSession' })
  @ApiOperation({
    summary: 'End a consultation session',
    description: 'Stops any active recording, removes the LiveKit room, and transitions the appointment to COMPLETED.',
    operationId: 'endConsultationSession',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ConsultationSessionResponseDto })
  @ApiStandardErrors()
  async end(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConsultationSessionResponseDto> {
    const session = await this.service.end(id);
    return toConsultationSessionResponse(session);
  }
}
