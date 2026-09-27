import type { RecordingNoticeDto } from '@telemed/shared-types';
import { ConsultationSession } from '../../domain/entities/consultation-session.entity';
import { ConsultationSessionResponseDto } from '../dto/consultation-session.response.dto';

export interface SessionPresence {
  doctorPresent: boolean;
  patientPresent: boolean;
}

export const toConsultationSessionResponse = (
  s: ConsultationSession,
  presence: SessionPresence = { doctorPresent: false, patientPresent: false },
  recordingNotice: RecordingNoticeDto | null = null,
  recordingActive = false,
): ConsultationSessionResponseDto => ({
  id: s.id,
  appointmentId: s.appointmentId,
  livekitRoomName: s.livekitRoomName,
  status: s.status,
  startedAt: s.startedAt ? s.startedAt.toISOString() : null,
  endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  patientJoinedAt: s.patientJoinedAt ? s.patientJoinedAt.toISOString() : null,
  doctorJoinedAt: s.doctorJoinedAt ? s.doctorJoinedAt.toISOString() : null,
  recordingId: s.recordingId,
  doctorPresent: presence.doctorPresent,
  patientPresent: presence.patientPresent,
  recordingNotice,
  doctorRecordingNoticeAt: s.doctorRecordingNoticeAt?.toISOString() ?? null,
  patientRecordingNoticeAt: s.patientRecordingNoticeAt?.toISOString() ?? null,
  recordingActive,
  endReason: s.endReason ?? null,
});
