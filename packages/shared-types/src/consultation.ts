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
