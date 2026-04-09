import { Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Base for tenant-scoped entities. tenantId is indexed and used by
 * TenantAwareRepository to enforce row-level isolation.
 */
export abstract class TenantOwnedEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;
}
