import { Column, Entity, Index, Unique } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('patient_tenant_profiles')
@Unique('uq_patient_tenant', ['patientId', 'tenantId'])
export class PatientTenantProfile extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ name: 'external_mis_id', type: 'varchar', length: 128, nullable: true })
  externalMisId!: string | null;
}
