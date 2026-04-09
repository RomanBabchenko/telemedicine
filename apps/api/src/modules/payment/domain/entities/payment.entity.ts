import { Column, Entity, Index, Unique } from 'typeorm';
import { PaymentStatus } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('payments')
@Index('idx_payment_appointment', ['appointmentId'])
@Unique('uq_payment_provider_intent', ['provider', 'providerIntentId'])
export class Payment extends TenantOwnedEntity {
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ name: 'provider_intent_id', type: 'varchar', length: 256 })
  providerIntentId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 8, default: 'UAH' })
  currency!: string;

  @Column({
    type: 'varchar',
    length: 32,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @Column({ name: 'webhook_event_ids', type: 'text', array: true, default: '{}' })
  webhookEventIds!: string[];
}
