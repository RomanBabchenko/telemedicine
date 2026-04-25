import { ApiProperty } from '@nestjs/swagger';
import type { NotificationPrefsDto } from '@telemed/shared-types';

export class NotificationPrefsResponseDto implements NotificationPrefsDto {
  @ApiProperty()
  email!: boolean;

  @ApiProperty()
  sms!: boolean;

  @ApiProperty()
  push!: boolean;

  @ApiProperty()
  marketing!: boolean;
}
