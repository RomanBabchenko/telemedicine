import { Column, Entity, Index } from 'typeorm';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('consultation_invites')
export class ConsultationInvite extends TenantOwnedEntity {
  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'consultation_session_id', type: 'uuid' })
  consultationSessionId!: string;

  // Nullable for anonymous-patient invites: when the MIS does not share PII
  // there is no User row to link. Doctor invites always have a real userId.
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  role!: 'PATIENT' | 'DOCTOR';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  // Explicit kill-switch — set by clinic admin or MIS via the revoke
  // endpoints. A revoked invite can never be consumed again even while its
  // TTL is still in the future. Separate from appointment cancellation:
  // you can revoke and re-issue a link without moving the appointment to
  // a terminal state.
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
