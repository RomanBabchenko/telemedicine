import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('invoices')
@Index('idx_invoice_period', ['tenantId', 'periodStart'])
export class Invoice extends TenantOwnedEntity {
  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 12, scale: 2, default: 0 })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 16, default: 'DRAFT' })
  status!: string;

  @Column({ name: 'pdf_file_asset_id', type: 'uuid', nullable: true })
  pdfFileAssetId!: string | null;
}
