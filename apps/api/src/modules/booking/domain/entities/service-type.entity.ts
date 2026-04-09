import { Column, Entity, Index } from 'typeorm';
import { ServiceMode } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('service_types')
export class ServiceType extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'doctor_id', type: 'uuid', nullable: true })
  doctorId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @Column({ name: 'duration_min', type: 'int', default: 30 })
  durationMin!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  price!: string;

  @Column({ type: 'varchar', length: 16, enum: ServiceMode, default: ServiceMode.VIDEO })
  mode!: ServiceMode;

  @Column({ name: 'is_follow_up', type: 'boolean', default: false })
  isFollowUp!: boolean;
}
