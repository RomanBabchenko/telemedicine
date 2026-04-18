import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Public } from '../../../common/auth/decorators';
import { ConsultationInviteService } from '../application/consultation-invite.service';
import { UserService } from '../../identity/application/user.service';
import { TokenService } from '../../identity/application/token.service';
import { Appointment } from '../../booking/domain/entities/appointment.entity';

// Match INVITE_EXPIRY_GRACE_MS in consultation-invite.service.ts — the JWT
// minted from an invite expires at the same moment the invite itself does.
const INVITE_JWT_GRACE_MS = 30 * 60 * 1000;

@ApiTags('auth')
@Controller('auth/invite')
export class InviteController {
  constructor(
    private readonly invites: ConsultationInviteService,
    private readonly users: UserService,
    private readonly tokens: TokenService,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
  ) {}

  @Post('consume')
  @Public()
  async consume(
    @Body() body: { token: string },
    @Req() req: Request,
  ) {
    const result = await this.invites.consume(body.token);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired invite link');
    }

    const user = await this.users.findById(result.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roles = await this.users.getRoles(result.userId, result.tenantId);

    const inviteCtx = {
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };

    // Cap the JWT lifetime at the appointment end so a leaked token can't be
    // reused after the consultation is over.
    const appt = await this.appointments.findOne({
      where: { id: result.appointmentId, tenantId: result.tenantId },
    });
    const accessTtlOverrideSec = appt
      ? Math.max(
          60,
          Math.ceil(
            (appt.endAt.getTime() + INVITE_JWT_GRACE_MS - Date.now()) / 1000,
          ),
        )
      : undefined;

    const issuedTokens = await this.tokens.issue(
      user,
      roles,
      result.tenantId,
      null,
      req.ip,
      req.headers['user-agent'] as string | undefined,
      { scope: 'invite', inviteCtx, accessTtlOverrideSec, skipRefresh: true },
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        tenantId: result.tenantId,
        mfaEnabled: user.mfaEnabled,
        scope: 'invite' as const,
        inviteCtx,
      },
      tokens: issuedTokens,
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };
  }
}
