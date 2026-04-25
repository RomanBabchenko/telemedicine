import { ApiProperty } from '@nestjs/swagger';
import { ConsultationStatus } from '@telemed/shared-types';
import type { ConsultationSessionDto } from '@telemed/shared-types';

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
}
