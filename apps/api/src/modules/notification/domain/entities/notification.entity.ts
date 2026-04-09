import { Column, Entity, Index } from 'typeorm';
import { NotificationChannel, NotificationStatus } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('notifications')
@Index('idx_notification_user', ['userId'])
export class Notification extends TenantOwnedEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 16, enum: NotificationChannel })
  channel!: NotificationChannel;

  @Column({ name: 'template_code', type: 'varchar', length: 64 })
  templateCode!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  payload!: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 16,
    enum: NotificationStatus,
    default: NotificationStatus.QUEUED,
  })
  status!: NotificationStatus;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;
}
