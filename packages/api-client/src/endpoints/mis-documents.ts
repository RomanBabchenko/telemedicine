import type { MisDocumentUploadDto, MisDocumentUploadResultDto } from '@telemed/shared-types';
import type { ApiClient } from '../http';

// Patient → MIS document relay. The API forwards the base64 body to the
// per-appointment upload URL the MIS supplied; nothing is stored. One call
// per file — the upload modal sends files sequentially.
export const misDocumentsApi = (client: ApiClient) => ({
  upload: (appointmentId: string, dto: MisDocumentUploadDto) =>
    client.post<MisDocumentUploadResultDto>(`/appointments/${appointmentId}/mis-documents`, dto, {
      // ~13 MB of base64 over mobile data plus the API's own 30 s upstream
      // timeout — leave headroom instead of axios's "no timeout" default.
      timeout: 90_000,
    }),
});
