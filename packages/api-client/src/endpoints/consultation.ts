import type {
  ConsultationSessionDto,
  JoinTokenDto,
  SessionEventDto,
  StartRecordingDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const consultationApi = (client: ApiClient) => ({
  getById: (id: string) => client.get<ConsultationSessionDto>(`/sessions/${id}`),
  joinToken: (id: string) => client.post<JoinTokenDto>(`/sessions/${id}/join-token`),
  postEvent: (id: string, dto: SessionEventDto) =>
    client.post<{ ok: true }>(`/sessions/${id}/events`, dto),
  startRecording: (id: string, dto: StartRecordingDto) =>
    client.post<{ ok: true; recordingId: string }>(`/sessions/${id}/start-recording`, dto),
  stopRecording: (id: string) =>
    client.post<{ ok: true }>(`/sessions/${id}/stop-recording`),
  end: (id: string) => client.post<{ ok: true }>(`/sessions/${id}/end`),
});
