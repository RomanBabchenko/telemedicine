import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('tenant_billing_plans')
export class TenantBillingPlan extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'monthly_fee', type: 'numeric', precision: 12, scale: 2, default: 0 })
  monthlyFee!: string;

  @Column({ name: 'per_consultation_fee', type: 'numeric', precision: 12, scale: 2, default: 0 })
  perConsultationFee!: string;

  @Column({ name: 'included_modules', type: 'text', array: true, default: '{}' })
  includedModules!: string[];

  @Column({ name: 'revenue_share_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  revenueSharePct!: string;
}
