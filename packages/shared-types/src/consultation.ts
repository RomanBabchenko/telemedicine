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
