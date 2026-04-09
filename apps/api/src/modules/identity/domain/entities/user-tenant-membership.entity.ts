import { Column, Entity, Index, Unique } from 'typeorm';
import { Role } from '@telemed/shared-types';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('user_tenant_memberships')
@Unique('uq_user_tenant_role', ['userId', 'tenantId', 'role'])
export class UserTenantMembership extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 32, enum: Role })
  role!: Role;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;
}
