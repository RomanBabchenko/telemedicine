import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('session_recordings')
@Unique('uq_recording_session', ['sessionId'])
export class SessionRecording extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'file_asset_id', type: 'uuid', nullable: true })
  fileAssetId!: string | null;

  @Column({ name: 'duration_sec', type: 'int', default: 0 })
  durationSec!: number;

  @Column({ name: 'consent_id', type: 'uuid', nullable: true })
  consentId!: string | null;

  @Column({ name: 'retention_until', type: 'timestamptz', nullable: true })
  retentionUntil!: Date | null;

  @Column({ name: 'egress_id', type: 'varchar', length: 128, nullable: true })
  egressId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'RECORDING' })
  status!: string;
}
