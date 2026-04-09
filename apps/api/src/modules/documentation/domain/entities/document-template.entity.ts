import { Column, Entity, Index } from 'typeorm';
import { DocumentType } from '@telemed/shared-types';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('document_templates')
export class DocumentTemplate extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 128 })
  specialization!: string;

  @Column({ type: 'varchar', length: 32, enum: DocumentType, default: DocumentType.CONCLUSION })
  type!: DocumentType;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  schema!: Record<string, unknown>;

  @Column({ name: 'default_values', type: 'jsonb', default: () => `'{}'::jsonb` })
  defaultValues!: Record<string, unknown>;
}
