import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

/**
 * Server-to-server credential that lets an MIS (e.g. DocDream) call our
 * `/integrations/:tenantId/*` endpoints. Stored hashed — the raw key is only
 * ever exposed once, at creation time. Multiple active keys per
 * (tenant, connector) are intentionally allowed for zero-downtime rotation.
 */
@Entity('integration_api_keys')
@Index('idx_integration_api_key_tenant_connector', ['tenantId', 'connectorId'])
export class IntegrationApiKey extends TenantOwnedEntity {
  @Column({ name: 'connector_id', type: 'varchar', length: 32 })
  connectorId!: string;

  @Index({ unique: true })
  @Column({ name: 'key_hash', type: 'text' })
  keyHash!: string;

  @Column({ name: 'key_masked', type: 'varchar', length: 32 })
  keyMasked!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  name!: string | null;

  // null = allow any IP. Entries can be either exact IPs (10.0.0.5) or
  // CIDR blocks (10.0.0.0/24). Validated on write, evaluated on every request.
  @Column({ name: 'ip_allowlist', type: 'text', array: true, nullable: true })
  ipAllowlist!: string[] | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
