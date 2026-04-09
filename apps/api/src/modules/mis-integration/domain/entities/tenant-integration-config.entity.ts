import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('tenant_integration_configs')
@Unique('uq_tenant_connector', ['tenantId', 'connector'])
export class TenantIntegrationConfig extends TenantOwnedEntity {
  @Column({ type: 'varchar', length: 32 })
  connector!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  credentials!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  options!: Record<string, unknown>;

  @Column({ name: 'last_full_sync_at', type: 'timestamptz', nullable: true })
  lastFullSyncAt!: Date | null;

  @Column({ name: 'last_incremental_sync_at', type: 'timestamptz', nullable: true })
  lastIncrementalSyncAt!: Date | null;
}
