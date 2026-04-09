import type {
  AppointmentDto,
  AvailabilityQuery,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  ReserveAppointmentDto,
  SlotDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const bookingApi = (client: ApiClient) => ({
  availability: (query: AvailabilityQuery) =>
    client.get<SlotDto[]>('/availability', { params: query }),
  reserve: (dto: ReserveAppointmentDto, idempotencyKey?: string) =>
    client.post<AppointmentDto>('/appointments/reserve', dto, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    }),
  confirm: (id: string) => client.post<AppointmentDto>(`/appointments/${id}/confirm`),
  cancel: (id: string, dto?: CancelAppointmentDto) =>
    client.post<AppointmentDto>(`/appointments/${id}/cancel`, dto ?? {}),
  reschedule: (id: string, dto: RescheduleAppointmentDto) =>
    client.post<AppointmentDto>(`/appointments/${id}/reschedule`, dto),
  list: () => client.get<AppointmentDto[]>('/appointments'),
  getById: (id: string) => client.get<AppointmentDto>(`/appointments/${id}`),
});
