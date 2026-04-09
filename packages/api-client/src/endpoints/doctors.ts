import type {
  AvailabilityRuleDto,
  CreateAvailabilityRuleDto,
  DoctorDto,
  DoctorSearchQuery,
  PaginatedResult,
  UpdateDoctorDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const doctorsApi = (client: ApiClient) => ({
  search: (query: DoctorSearchQuery) =>
    client.get<PaginatedResult<DoctorDto>>('/doctors', { params: query }),
  getById: (id: string) => client.get<DoctorDto>(`/doctors/${id}`),
  update: (id: string, dto: UpdateDoctorDto) =>
    client.patch<DoctorDto>(`/doctors/${id}`, dto),
  listAvailabilityRules: (id: string) =>
    client.get<AvailabilityRuleDto[]>(`/doctors/${id}/availability`),
  createAvailabilityRule: (id: string, dto: CreateAvailabilityRuleDto) =>
    client.post<AvailabilityRuleDto>(`/doctors/${id}/availability`, dto),
  deleteAvailabilityRule: (doctorId: string, ruleId: string) =>
    client.delete<{ ok: true }>(`/doctors/${doctorId}/availability/${ruleId}`),
  verify: (id: string) => client.post<{ ok: true }>(`/doctors/${id}/documents/verify`),
});
