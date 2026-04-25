import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../common/auth/decorators';
import { ApiAuthErrors } from '../../../common/swagger';
import { InviteConsumeService } from '../application/invite-consume.service';
import { ConsumeInviteBodyDto, InviteConsumeResponseDto } from './dto';

// Prefers the X-Forwarded-For chain's first hop so the reverse proxy's own
// address doesn't become the "client IP" of every invite consumption.
const resolveClientIp = (req: Request): string | undefined => {
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? undefined;
};

@ApiTags('auth')
@Controller('auth/invite')
export class InviteController {
  constructor(private readonly invites: InviteConsumeService) {}

  @Post('consume')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a single-use invite token for an invite-scoped session',
    description:
      "Mints a JWT with scope='invite' (named invites) or 'invite-anon' (anonymous patients). The token lifetime is capped at the appointment end plus a grace window; tenant invite policy may bind the JWT to the caller IP / User-Agent.",
    operationId: 'consumeInvite',
  })
  @ApiBody({ type: ConsumeInviteBodyDto })
  @ApiOkResponse({ type: InviteConsumeResponseDto })
  @ApiAuthErrors()
  consume(
    @Body() body: ConsumeInviteBodyDto,
    @Req() req: Request,
  ): Promise<InviteConsumeResponseDto> {
    return this.invites.consume(body.token, {
      ip: resolveClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
