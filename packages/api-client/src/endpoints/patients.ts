import type {
  AppointmentDto,
  ConsentDto,
  GrantConsentDto,
  MedicalDocumentDto,
  PatientDto,
  UpdatePatientDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const patientsApi = (client: ApiClient) => ({
  me: () => client.get<PatientDto>('/patients/me'),
  updateMe: (dto: UpdatePatientDto) => client.patch<PatientDto>('/patients/me', dto),
  myAppointments: () => client.get<AppointmentDto[]>('/patients/me/appointments'),
  myDocuments: () => client.get<MedicalDocumentDto[]>('/patients/me/documents'),
  myDocumentPdf: (id: string) =>
    client.get<{ url: string }>(`/patients/me/documents/${id}/pdf`),
  myConsents: () => client.get<ConsentDto[]>('/patients/me/consents'),
  grantConsent: (dto: GrantConsentDto) =>
    client.post<ConsentDto>('/patients/me/consents', dto),
});
