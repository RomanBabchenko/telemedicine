import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

export type SessionEventType =
  | 'JOIN'
  | 'LEAVE'
  | 'CHAT'
  | 'FILE'
  | 'RECONNECT'
  | 'RECORDING_START'
  | 'RECORDING_STOP'
  | 'ERROR';

@Entity('session_events')
@Index('idx_session_event_session', ['sessionId'])
export class SessionEvent extends TenantOwnedEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: SessionEventType;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  payload!: Record<string, unknown>;
}
