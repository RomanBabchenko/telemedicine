import { ApiProperty } from '@nestjs/swagger';
import { ConsultationStatus } from '@telemed/shared-types';
import type {
  ConsultationEndReason,
  ConsultationSessionDto,
  RecordingNoticeDto,
} from '@telemed/shared-types';

export class RecordingNoticeResponseDto implements RecordingNoticeDto {
  @ApiProperty({ description: 'Consent sentence (clinic text or the default)' })
  text!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Offer agreement, else clinic website',
  })
  linkUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  linkLabel!: string | null;
}

export class ConsultationSessionResponseDto implements ConsultationSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ description: 'LiveKit room identifier (server-generated)' })
  livekitRoomName!: string;

  @ApiProperty({ enum: Object.values(ConsultationStatus) })
  status!: ConsultationStatus;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  patientJoinedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  doctorJoinedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  recordingId!: string | null;

  @ApiProperty({
    description: 'True when a doctor is currently connected to the LiveKit room',
  })
  doctorPresent!: boolean;

  @ApiProperty({
    description: 'True when a patient is currently connected to the LiveKit room',
  })
  patientPresent!: boolean;

  @ApiProperty({
    type: RecordingNoticeResponseDto,
    nullable: true,
    description:
      'Notice both sides must accept before join-token is issued; null when the clinic has the notice off or is not recording',
  })
  recordingNotice!: RecordingNoticeResponseDto | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  doctorRecordingNoticeAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  patientRecordingNoticeAt!: string | null;

  @ApiProperty({
    description:
      'True while the audio recording is running (derived on each fetch) — drives the in-call recording badge',
  })
  recordingActive!: boolean;

  @ApiProperty({
    enum: ['DOCTOR', 'AUTO_TIMEOUT', 'RECORDING_DECLINED'],
    nullable: true,
    description:
      'Why the session ended: DOCTOR (explicit end), AUTO_TIMEOUT (closed by the server after the join window — room empty, audio not recording), RECORDING_DECLINED. Null while not ended.',
  })
  endReason!: ConsultationEndReason | null;
}
