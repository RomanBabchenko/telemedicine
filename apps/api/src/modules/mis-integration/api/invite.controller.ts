import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../common/auth/decorators';
import { ConsultationInviteService } from '../application/consultation-invite.service';
import { UserService } from '../../identity/application/user.service';
import { TokenService } from '../../identity/application/token.service';

@ApiTags('auth')
@Controller('auth/invite')
export class InviteController {
  constructor(
    private readonly invites: ConsultationInviteService,
    private readonly users: UserService,
    private readonly tokens: TokenService,
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

    const issuedTokens = await this.tokens.issue(
      user,
      roles,
      result.tenantId,
      null,
      req.ip,
      req.headers['user-agent'] as string | undefined,
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
      },
      tokens: issuedTokens,
      appointmentId: result.appointmentId,
      consultationSessionId: result.consultationSessionId,
    };
  }
}
