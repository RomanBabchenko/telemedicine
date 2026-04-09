import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  subdomain!: string;

  @Column({ name: 'brand_name', type: 'varchar', length: 256 })
  brandName!: string;

  @Column({ name: 'primary_color', type: 'varchar', length: 16, default: '#1f7ae0' })
  primaryColor!: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'uk' })
  locale!: string;

  @Column({ type: 'varchar', length: 8, default: 'UAH' })
  currency!: string;

  @Column({ type: 'jsonb', name: 'feature_matrix', default: () => `'{}'::jsonb` })
  featureMatrix!: Record<string, boolean>;

  @Column({ type: 'jsonb', name: 'audio_policy', default: () => `'{}'::jsonb` })
  audioPolicy!: { enabled?: boolean; retentionDays?: number; consentRequired?: boolean };

  @Column({ name: 'billing_plan_id', type: 'uuid', nullable: true })
  billingPlanId!: string | null;

  @Column({ name: 'is_platform', type: 'boolean', default: false })
  isPlatform!: boolean;
}
