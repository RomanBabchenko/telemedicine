import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { NotificationService } from '../application/notification.service';
import {
  NotificationPrefsResponseDto,
  NotificationResponseDto,
  UpdatePrefsBodyDto,
} from './dto';
import {
  toNotificationPrefsResponse,
  toNotificationResponse,
} from './mappers/notification.mapper';

@ApiTags('notifications')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiAuth()
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get('notifications')
  @ApiOperation({
    summary: "List the caller's recent notifications",
    description: 'Last 100 rows, newest first.',
    operationId: 'listMyNotifications',
  })
  @ApiOkResponse({ type: [NotificationResponseDto] })
  @ApiStandardErrors()
  async list(
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.service.listForUser(user.id);
    return rows.map(toNotificationResponse);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a notification as read',
    operationId: 'markNotificationRead',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  async markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OkResponseDto> {
    await this.service.markRead(id);
    return OkResponseDto.value;
  }

  @Get('users/me/notification-prefs')
  @ApiOperation({
    summary: "Fetch the caller's notification preferences",
    description: 'Preferences are created with defaults on first read.',
    operationId: 'getMyNotificationPrefs',
  })
  @ApiOkResponse({ type: NotificationPrefsResponseDto })
  @ApiStandardErrors()
  async prefs(
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationPrefsResponseDto> {
    const p = await this.service.getPrefs(user.id);
    return toNotificationPrefsResponse(p);
  }

  @Patch('users/me/notification-prefs')
  @ApiOperation({
    summary: "Update the caller's notification preferences",
    operationId: 'updateMyNotificationPrefs',
  })
  @ApiBody({ type: UpdatePrefsBodyDto })
  @ApiOkResponse({ type: NotificationPrefsResponseDto })
  @ApiStandardErrors()
  async updatePrefs(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePrefsBodyDto,
  ): Promise<NotificationPrefsResponseDto> {
    const p = await this.service.updatePrefs(user.id, body);
    return toNotificationPrefsResponse(p);
  }
}
