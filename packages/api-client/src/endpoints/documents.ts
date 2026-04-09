import type {
  CreateConclusionDto,
  CreatePrescriptionDto,
  CreateReferralDto,
  MedicalDocumentDto,
  PrescriptionDto,
  ReferralDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const documentsApi = (client: ApiClient) => ({
  listForAppointment: (appointmentId: string) =>
    client.get<MedicalDocumentDto[]>(`/appointments/${appointmentId}/documents`),
  createConclusion: (appointmentId: string, dto: CreateConclusionDto) =>
    client.post<MedicalDocumentDto>(
      `/appointments/${appointmentId}/documents/conclusion`,
      dto,
    ),
  signDocument: (id: string) => client.post<MedicalDocumentDto>(`/documents/${id}/sign`),
  pdfUrl: (id: string) => client.get<{ url: string }>(`/documents/${id}/pdf`),

  createPrescription: (appointmentId: string, dto: CreatePrescriptionDto) =>
    client.post<PrescriptionDto>(`/appointments/${appointmentId}/prescriptions`, dto),
  signPrescription: (id: string) => client.post<PrescriptionDto>(`/prescriptions/${id}/sign`),

  createReferral: (appointmentId: string, dto: CreateReferralDto) =>
    client.post<ReferralDto>(`/appointments/${appointmentId}/referrals`, dto),
});
