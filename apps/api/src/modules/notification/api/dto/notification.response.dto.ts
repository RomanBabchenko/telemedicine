import { ApiProperty } from '@nestjs/swagger';
import { NotificationChannel, NotificationStatus } from '@telemed/shared-types';
import type { NotificationDto } from '@telemed/shared-types';

export class NotificationResponseDto implements NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Object.values(NotificationChannel) })
  channel!: NotificationChannel;

  @ApiProperty({ description: 'Template code (e.g. appointment.reminder)' })
  templateCode!: string;

  @ApiProperty({ type: String, nullable: true })
  subject!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty({ enum: Object.values(NotificationStatus) })
  status!: NotificationStatus;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  sentAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: Object, description: 'Template variables rendered into the body' })
  payload!: Record<string, unknown>;
}
