import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('doctor_tenant_profiles')
@Unique('uq_doctor_tenant', ['doctorId', 'tenantId'])
export class DoctorTenantProfile extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 256, nullable: true })
  displayName!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  price!: string;

  @Column({ name: 'is_published', type: 'boolean', default: true })
  isPublished!: boolean;

  @Column({ name: 'slot_source_is_mis', type: 'boolean', default: false })
  slotSourceIsMis!: boolean;
}
