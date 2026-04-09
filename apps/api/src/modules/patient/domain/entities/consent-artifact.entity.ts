import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

@Entity('consent_artifacts')
export class ConsentArtifact extends BaseEntity {
  @Index()
  @Column({ name: 'consent_id', type: 'uuid' })
  consentId!: string;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'payload_hash', type: 'text', nullable: true })
  payloadHash!: string | null;

  @Column({ name: 'file_asset_id', type: 'uuid', nullable: true })
  fileAssetId!: string | null;
}
