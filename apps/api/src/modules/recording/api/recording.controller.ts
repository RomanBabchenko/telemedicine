import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { RecordingService } from '../application/recording.service';

class StartRecordingBodyDto {
  @IsString() consentId!: string;
}

@ApiTags('recording')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordingController {
  constructor(private readonly service: RecordingService) {}

  @Post(':id/start-recording')
  @Roles(Role.DOCTOR, Role.CLINIC_OPERATOR)
  @Auditable({ action: 'recording.started', resource: 'SessionRecording' })
  async start(@Param('id') sessionId: string, @Body() body: StartRecordingBodyDto) {
    const r = await this.service.start(sessionId, body.consentId);
    return { ok: true, recordingId: r.id };
  }

  @Post(':id/stop-recording')
  @Roles(Role.DOCTOR, Role.CLINIC_OPERATOR)
  @Auditable({ action: 'recording.stopped', resource: 'SessionRecording' })
  async stop(@Param('id') sessionId: string) {
    await this.service.stop(sessionId);
    return { ok: true };
  }

  @Get(':id/recording')
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  async getRecording(@Param('id') sessionId: string) {
    const info = await this.service.getRecordingInfo(sessionId);
    if (!info) throw new NotFoundException('Recording not found');
    return info;
  }
}
