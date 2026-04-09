import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('feature_flags')
@Unique('uq_feature_flag_tenant_key', ['tenantId', 'key'])
export class FeatureFlag extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'jsonb', default: () => `'true'::jsonb` })
  value!: unknown;
}
