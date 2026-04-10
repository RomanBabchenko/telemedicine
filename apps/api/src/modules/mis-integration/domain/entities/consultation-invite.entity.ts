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

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: 'PATIENT' | 'DOCTOR';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
}
