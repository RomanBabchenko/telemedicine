import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('file_assets')
@Index('idx_file_purpose', ['purpose'])
export class FileAsset extends TenantOwnedEntity {
  @Column({ type: 'varchar', length: 128 })
  bucket!: string;

  @Column({ name: 'object_key', type: 'varchar', length: 512 })
  objectKey!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 128 })
  contentType!: string;

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sha256!: string | null;

  @Column({ type: 'varchar', length: 64 })
  purpose!: string;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @Column({ name: 'access_policy', type: 'jsonb', default: () => `'{}'::jsonb` })
  accessPolicy!: Record<string, unknown>;
}
