import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser, AuthUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { NotificationService } from '../application/notification.service';

class UpdatePrefsBodyDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() marketing?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get('notifications')
  list(@CurrentUser() user: AuthUser) {
    return this.service.listForUser(user.id);
  }

  @Post('notifications/:id/read')
  async markRead(@Param('id') id: string) {
    await this.service.markRead(id);
    return { ok: true };
  }

  @Get('users/me/notification-prefs')
  prefs(@CurrentUser() user: AuthUser) {
    return this.service.getPrefs(user.id);
  }

  @Patch('users/me/notification-prefs')
  updatePrefs(@CurrentUser() user: AuthUser, @Body() body: UpdatePrefsBodyDto) {
    return this.service.updatePrefs(user.id, body);
  }
}
