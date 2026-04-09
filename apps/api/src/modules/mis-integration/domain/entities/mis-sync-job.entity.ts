import { Column, Entity, Index } from 'typeorm';
import { SyncJobStatus, SyncJobType } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('mis_sync_jobs')
@Index('idx_sync_job_tenant_started', ['tenantId', 'createdAt'])
export class MisSyncJob extends TenantOwnedEntity {
  @Column({ type: 'varchar', length: 32 })
  connector!: string;

  @Column({ name: 'job_type', type: 'varchar', length: 16, enum: SyncJobType })
  jobType!: SyncJobType;

  @Column({
    type: 'varchar',
    length: 16,
    enum: SyncJobStatus,
    default: SyncJobStatus.QUEUED,
  })
  status!: SyncJobStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  stats!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error!: string | null;
}
