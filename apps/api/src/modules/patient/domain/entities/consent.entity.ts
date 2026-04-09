import { Column, Entity, Index } from 'typeorm';
import { ConsentStatus, ConsentType } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('consents')
export class Consent extends TenantOwnedEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32, enum: ConsentType })
  type!: ConsentType;

  @Column({ type: 'varchar', length: 16, enum: ConsentStatus, default: ConsentStatus.GRANTED })
  status!: ConsentStatus;

  @Column({ name: 'version_code', type: 'varchar', length: 32, default: 'v1' })
  versionCode!: string;

  @Column({ name: 'granted_at', type: 'timestamptz', default: () => 'now()' })
  grantedAt!: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;
}
