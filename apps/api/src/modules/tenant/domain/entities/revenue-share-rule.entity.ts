import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('revenue_share_rules')
export class RevenueShareRule extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'doctor_id', type: 'uuid', nullable: true })
  doctorId!: string | null;

  @Column({ name: 'platform_pct', type: 'numeric', precision: 5, scale: 2, default: 15 })
  platformPct!: string;

  @Column({ name: 'clinic_pct', type: 'numeric', precision: 5, scale: 2, default: 25 })
  clinicPct!: string;

  @Column({ name: 'doctor_pct', type: 'numeric', precision: 5, scale: 2, default: 60 })
  doctorPct!: string;

  @Column({ name: 'mis_partner_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  misPartnerPct!: string;
}
