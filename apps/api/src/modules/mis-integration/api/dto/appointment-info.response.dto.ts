import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus, ConsultationStatus } from '@telemed/shared-types';

/**
 * Per-call consultation info — the `consultation` block on the appointment
 * GET response. Becomes non-null once the patient or doctor has clicked
 * "join" at least once (the session is created lazily on first joinToken).
 *
 * MIS uses this to answer "did the consultation actually happen?":
 *   - both `patientJoinedAt` and `doctorJoinedAt` set → the call took place
 *   - one set, one null → the other party didn't show
 *   - `endedAt` set → the call is over (recording will be ready shortly)
 */
export class AppointmentConsultationInfoDto {
  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ enum: Object.values(ConsultationStatus) })
  status!: ConsultationStatus;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  endedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  patientJoinedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  doctorJoinedAt!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Recording id, if the audio recorder produced one. Use the /recording endpoint to fetch the actual MP3.',
  })
  recordingId!: string | null;
}

export class AppointmentInfoResponseDto {
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ enum: Object.values(AppointmentStatus) })
  status!: AppointmentStatus;

  @ApiProperty({ format: 'date-time', description: 'Scheduled start (reflects the latest reschedule, if any)' })
  startAt!: string;

  @ApiProperty({ format: 'date-time', description: 'Scheduled end (reflects the latest reschedule, if any)' })
  endAt!: string;

  @ApiProperty({ type: String, nullable: true })
  cancelledReason!: string | null;

  @ApiProperty()
  isAnonymousPatient!: boolean;

  @ApiProperty({ enum: ['prepaid', 'postpaid'], nullable: true, type: String })
  misPaymentType!: 'prepaid' | 'postpaid' | null;

  @ApiProperty({ enum: ['paid', 'unpaid'], nullable: true, type: String })
  misPaymentStatus!: 'paid' | 'unpaid' | null;

  @ApiProperty({
    type: AppointmentConsultationInfoDto,
    nullable: true,
    description:
      "Set once a consultation session exists for this appointment (i.e. someone has tried to join at least once). null while the appointment is still in pre-call state and nobody has clicked join.",
  })
  consultation!: AppointmentConsultationInfoDto | null;
}
