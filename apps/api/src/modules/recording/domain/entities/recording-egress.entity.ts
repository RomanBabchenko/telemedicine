import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

export type RecordingEgressStatus = 'RECORDING' | 'STORED' | 'FAILED';

@Entity('recording_egresses')
@Unique('uq_recording_egress_egress_id', ['egressId'])
@Unique('uq_recording_egress_track', ['recordingId', 'trackSid'])
export class RecordingEgress extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'recording_id', type: 'uuid' })
  recordingId!: string;

  @Column({ name: 'egress_id', type: 'varchar', length: 128 })
  egressId!: string;

  @Column({ name: 'participant_identity', type: 'varchar', length: 256 })
  participantIdentity!: string;

  @Column({ name: 'track_sid', type: 'varchar', length: 128 })
  trackSid!: string;

  @Column({ name: 'object_key', type: 'varchar', length: 512 })
  objectKey!: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'RECORDING' })
  status!: RecordingEgressStatus;

  @Column({ name: 'duration_sec', type: 'int', default: 0 })
  durationSec!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;
}
