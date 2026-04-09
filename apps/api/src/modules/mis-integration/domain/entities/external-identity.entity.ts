import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

export type ExternalEntityType =
  | 'DOCTOR'
  | 'PATIENT'
  | 'SLOT'
  | 'APPOINTMENT'
  | 'SERVICE_TYPE';

@Entity('external_identities')
@Unique('uq_external_identity', ['tenantId', 'externalSystem', 'entityType', 'externalId'])
@Index('idx_external_internal', ['internalId'])
export class ExternalIdentity extends TenantOwnedEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 32 })
  entityType!: ExternalEntityType;

  @Column({ name: 'internal_id', type: 'uuid' })
  internalId!: string;

  @Column({ name: 'external_system', type: 'varchar', length: 32 })
  externalSystem!: string;

  @Column({ name: 'external_id', type: 'varchar', length: 256 })
  externalId!: string;
}
