import { Column, DeleteDateColumn, Entity, Index, Unique, VersionColumn } from 'typeorm';
import { AppointmentSource, AppointmentStatus } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('appointments')
@Unique('uq_appointment_slot', ['slotId'])
@Index('idx_appointment_tenant_status', ['tenantId', 'status'])
@Index('idx_appointment_patient', ['patientId'])
@Index('idx_appointment_doctor', ['doctorId'])
@Index('idx_appointment_tenant_source', ['tenantId', 'source'])
export class Appointment extends TenantOwnedEntity {
  @Column({ name: 'slot_id', type: 'uuid' })
  slotId!: string;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId!: string | null;

  @Column({ name: 'is_anonymous_patient', type: 'boolean', default: false })
  isAnonymousPatient!: boolean;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId!: string;

  // PLATFORM — booked via marketplace / widget / admin console.
  // MIS — created by an external MIS webhook. INTEGRATION_ADMIN is scoped to
  // MIS rows only, so this must be set at creation time (see
  // webhook-event.handler.ts) and is backfilled by migration 1700000013000.
  @Column({
    type: 'varchar',
    length: 16,
    enum: AppointmentSource,
    default: AppointmentSource.PLATFORM,
  })
  source!: AppointmentSource;

  @Column({
    type: 'varchar',
    length: 32,
    enum: AppointmentStatus,
    default: AppointmentStatus.DRAFT,
  })
  status!: AppointmentStatus;

  @Column({ name: 'reason_text', type: 'text', nullable: true })
  reasonText!: string | null;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'mis_payment_type', type: 'varchar', length: 16, nullable: true })
  misPaymentType!: 'prepaid' | 'postpaid' | null;

  @Column({ name: 'mis_payment_status', type: 'varchar', length: 16, nullable: true })
  misPaymentStatus!: 'paid' | 'unpaid' | null;

  @Column({ name: 'consultation_session_id', type: 'uuid', nullable: true })
  consultationSessionId!: string | null;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason!: string | null;

  @VersionColumn({ default: 1 })
  version!: number;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
