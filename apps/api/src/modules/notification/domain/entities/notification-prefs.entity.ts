import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('notification_prefs')
export class NotificationPrefs extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'boolean', default: true })
  email!: boolean;

  @Column({ type: 'boolean', default: true })
  sms!: boolean;

  @Column({ type: 'boolean', default: true })
  push!: boolean;

  @Column({ type: 'boolean', default: false })
  marketing!: boolean;
}
