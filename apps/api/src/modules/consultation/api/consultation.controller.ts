import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
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
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable, AuditViewAccess } from '../../../common/audit/decorators';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { ConsultationService } from '../application/consultation.service';
import { SessionEventType } from '../domain/entities/session-event.entity';
import {
  ConsultationSessionResponseDto,
  JoinTokenResponseDto,
  SessionEventBodyDto,
} from './dto';
import { toConsultationSessionResponse } from './mappers/consultation.mapper';

@ApiTags('sessions')
@Controller('sessions')
@UseGuards(JwtAuthGuard)
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
    return toConsultationSessionResponse(session);
  }

  @Post(':id/join-token')
  @HttpCode(HttpStatus.CREATED)
  @InviteAccessible('consultationSessionId')
  @Auditable({ action: 'session.join-token.issued', resource: 'ConsultationSession' })
  @ApiOperation({
    summary: 'Issue a LiveKit join token for a session',
    description:
      "Three gates apply before a token is issued: (1) terminal-state gate (code 'consultation.terminal'); (2) time-gate — room opens 15 min before start, closes 30 min after end ('consultation.not_yet_open', 'consultation.meeting_over'); (3) MIS prepaid gate for patients ('consultation.mis_payment_pending'). Frontends branch on the ErrorResponseDto.code.",
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
