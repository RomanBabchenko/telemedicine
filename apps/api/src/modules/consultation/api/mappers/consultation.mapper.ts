import { ConsultationSession } from '../../domain/entities/consultation-session.entity';
import { ConsultationSessionResponseDto } from '../dto/consultation-session.response.dto';

export const toConsultationSessionResponse = (
  s: ConsultationSession,
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
});
