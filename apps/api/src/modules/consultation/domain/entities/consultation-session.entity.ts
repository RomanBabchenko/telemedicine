import { Column, Entity, Index, Unique } from 'typeorm';
import { ConsultationStatus } from '@telemed/shared-types';
import { TenantOwnedEntity } from '../../../../common/entities/tenant-owned.entity';

@Entity('consultation_sessions')
@Unique('uq_session_appointment', ['appointmentId'])
export class ConsultationSession extends TenantOwnedEntity {
  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Index()
  @Column({ name: 'livekit_room_name', type: 'varchar', length: 128 })
  livekitRoomName!: string;

  @Column({
    type: 'varchar',
    length: 16,
    enum: ConsultationStatus,
    default: ConsultationStatus.SCHEDULED,
  })
  status!: ConsultationStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ name: 'patient_joined_at', type: 'timestamptz', nullable: true })
  patientJoinedAt!: Date | null;

  @Column({ name: 'doctor_joined_at', type: 'timestamptz', nullable: true })
  doctorJoinedAt!: Date | null;

  @Column({ name: 'recording_id', type: 'uuid', nullable: true })
  recordingId!: string | null;
}
