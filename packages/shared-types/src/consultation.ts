import { ConsultationStatus } from './enums';

export interface ConsultationSessionDto {
  id: string;
  appointmentId: string;
  livekitRoomName: string;
  status: ConsultationStatus;
  startedAt: string | null;
  endedAt: string | null;
  patientJoinedAt: string | null;
  doctorJoinedAt: string | null;
  recordingId: string | null;
  // Live room presence — derived from LiveKit on each fetch (not persisted),
  // so the lobby can show "Лікар онлайн" / "Пацієнт онлайн" without
  // connecting to the room. False also when LiveKit is unreachable.
  doctorPresent: boolean;
  patientPresent: boolean;
  // Recording notice each side must accept before a join token is issued.
  // Null when the clinic has the notice off or isn't recording at all.
  recordingNotice: RecordingNoticeDto | null;
  doctorRecordingNoticeAt: string | null;
  patientRecordingNoticeAt: string | null;
  // Audio is being recorded right now — drives the in-call «Запис» badge.
  // Derived on each fetch (recording row still RECORDING, session not ENDED).
  recordingActive: boolean;
  // Who/what ended the session; null while it's not ENDED (and for sessions
  // ended before this field existed).
  endReason: ConsultationEndReason | null;
}

// DOCTOR — explicit «Завершити» by the doctor; AUTO_TIMEOUT — closed by the
// server after the join window with an empty room and no audio recording;
// RECORDING_DECLINED — a participant refused the recording notice.
export type ConsultationEndReason = 'DOCTOR' | 'AUTO_TIMEOUT' | 'RECORDING_DECLINED';

export interface RecordingNoticeDto {
  text: string;
  linkUrl: string | null;
  linkLabel: string | null;
}

export type RecordingNoticeDecision = 'accepted' | 'declined';

export interface RecordingNoticeDecisionDto {
  decision: RecordingNoticeDecision;
}

export interface JoinTokenDto {
  token: string;
  livekitUrl: string;
  roomName: string;
  identity: string;
  expiresAt: string;
}

export interface SessionEventDto {
  type: string;
  payload?: Record<string, unknown>;
}

export interface StartRecordingDto {
  consentId: string;
}
