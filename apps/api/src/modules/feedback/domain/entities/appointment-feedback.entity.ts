import { Column, Entity, Index, Unique } from 'typeorm';
import type { FeedbackResolved } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

export type FeedbackSubmittedScope = 'full' | 'invite' | 'invite-anon';

// One patient answer per appointment (see migration 1700000017000).
@Entity('appointment_feedbacks')
@Unique('uq_appointment_feedback_appointment', ['appointmentId'])
@Index('idx_appointment_feedback_tenant_clarity', ['tenantId', 'clarityRating'])
@Index('idx_appointment_feedback_tenant_doctor', ['tenantId', 'doctorId'])
export class AppointmentFeedback extends TenantOwnedEntity {
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'consultation_session_id', type: 'uuid', nullable: true })
  consultationSessionId!: string | null;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  // Null for anonymous-patient appointments (no Patient row).
  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  resolved!: FeedbackResolved;

  @Column({ name: 'clarity_rating', type: 'smallint' })
  clarityRating!: number;

  // users(id) of the submitter, or NULL for invite-anon — the pseudonym must
  // not land in a users FK column (see the AuthUser.id comment).
  @Column({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId!: string | null;

  @Column({ name: 'submitted_scope', type: 'varchar', length: 16, default: 'full' })
  submittedScope!: FeedbackSubmittedScope;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;
}
