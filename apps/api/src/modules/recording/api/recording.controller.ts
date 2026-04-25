import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { RecordingService } from '../application/recording.service';
import {
  RecordingInfoResponseDto,
  StartRecordingBodyDto,
  StartRecordingResponseDto,
} from './dto';

@ApiTags('recording')
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class RecordingController {
  constructor(private readonly service: RecordingService) {}

  @Post(':id/start-recording')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.DOCTOR, Role.CLINIC_OPERATOR)
  @Auditable({ action: 'recording.started', resource: 'SessionRecording' })
  @ApiOperation({
    summary: 'Start audio recording for a consultation session',
    description:
      'Requires an active AUDIO_RECORDING Consent and the tenant audio policy enabled. Auto-recording may have already started the file — this endpoint is for the manual/explicit path.',
    operationId: 'startSessionRecording',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Consultation session id' })
  @ApiBody({ type: StartRecordingBodyDto })
  @ApiCreatedResponse({ type: StartRecordingResponseDto })
  @ApiStandardErrors()
  async start(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @Body() body: StartRecordingBodyDto,
  ): Promise<StartRecordingResponseDto> {
    const r = await this.service.start(sessionId, body.consentId);
    return { ok: true, recordingId: r.id };
  }

  @Post(':id/stop-recording')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DOCTOR, Role.CLINIC_OPERATOR)
  @Auditable({ action: 'recording.stopped', resource: 'SessionRecording' })
  @ApiOperation({
    summary: 'Stop audio recording for a consultation session',
    description: 'Idempotent. Final duration is populated once LiveKit fires egress_ended.',
    operationId: 'stopSessionRecording',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Consultation session id' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  async stop(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
  ): Promise<OkResponseDto> {
    await this.service.stop(sessionId);
    return OkResponseDto.value;
  }

  @Get(':id/recording')
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @ApiOperation({
    summary: 'Fetch recording metadata and a signed download URL',
    description: 'downloadUrl is non-null only when the recording is STORED (egress has flushed the MP3 to MinIO).',
    operationId: 'getSessionRecording',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Consultation session id' })
  @ApiOkResponse({ type: RecordingInfoResponseDto })
  @ApiStandardErrors()
  async getRecording(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
  ): Promise<RecordingInfoResponseDto> {
    const info = await this.service.getRecordingInfo(sessionId);
    if (!info) throw new NotFoundException('Recording not found');
    return info;
  }
}
