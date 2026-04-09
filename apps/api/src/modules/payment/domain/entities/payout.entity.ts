import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('payouts')
export class Payout extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  amount!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: string;
}
