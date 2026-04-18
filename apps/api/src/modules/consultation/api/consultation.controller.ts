import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser, InviteAccessible } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Auditable, AuditViewAccess } from '../../../common/audit/decorators';
import { ConsultationService } from '../application/consultation.service';
import { SessionEventBodyDto } from './dto';
import { SessionEventType } from '../domain/entities/session-event.entity';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class ConsultationController {
  constructor(private readonly service: ConsultationService) {}

  @Get(':id')
  @InviteAccessible('consultationSessionId')
  @AuditViewAccess('ConsultationSession')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post(':id/join-token')
  @InviteAccessible('consultationSessionId')
  @Auditable({ action: 'session.join-token.issued', resource: 'ConsultationSession' })
  joinToken(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.issueJoinToken(id, user);
  }

  @Post(':id/events')
  @InviteAccessible('consultationSessionId')
  async events(
    @Param('id') id: string,
    @Body() body: SessionEventBodyDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.recordEvent(
      id,
      body.type as SessionEventType,
      user.id,
      body.payload ?? {},
    );
    return { ok: true };
  }

  @Post(':id/end')
  @InviteAccessible('consultationSessionId')
  @Auditable({ action: 'session.ended', resource: 'ConsultationSession' })
  end(@Param('id') id: string) {
    return this.service.end(id);
  }
}
