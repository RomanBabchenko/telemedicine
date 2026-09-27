import { Column, Entity, Index, Unique } from 'typeorm';
import { ConsultationStatus, type ConsultationEndReason } from '@telemed/shared-types';
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

  // When each side accepted the clinic's recording notice. Set once; a
  // reconnect skips the notice and join-token checks it while it's required.
  @Column({ name: 'doctor_recording_notice_at', type: 'timestamptz', nullable: true })
  doctorRecordingNoticeAt!: Date | null;

  @Column({ name: 'patient_recording_notice_at', type: 'timestamptz', nullable: true })
  patientRecordingNoticeAt!: Date | null;

  // Set together with status=ENDED — see ConsultationEndReason.
  @Column({ name: 'end_reason', type: 'varchar', length: 24, nullable: true })
  endReason!: ConsultationEndReason | null;
}
