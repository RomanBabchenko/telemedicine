import { Column, Entity, Index } from 'typeorm';
import { LedgerAccount } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('ledger_entries')
@Index('idx_ledger_payment', ['paymentId'])
@Index('idx_ledger_account', ['account'])
export class LedgerEntry extends TenantOwnedEntity {
  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @Column({ type: 'varchar', length: 32, enum: LedgerAccount })
  account!: LedgerAccount;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  debit!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  credit!: string;

  @Column({ type: 'text', nullable: true })
  memo!: string | null;
}
