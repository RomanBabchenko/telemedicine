import { AppointmentStatus, ServiceMode, SlotStatus } from './enums';

export interface ServiceTypeDto {
  id: string;
  code: string;
  name: string;
  durationMin: number;
  price: number;
  mode: ServiceMode;
  isFollowUp: boolean;
}

export interface SlotDto {
  id: string;
  doctorId: string;
  serviceTypeId: string;
  startAt: string;
  endAt: string;
  status: SlotStatus;
  sourceIsMis: boolean;
}

export interface AvailabilityQuery {
  doctorId: string;
  serviceTypeId?: string;
  from: string;
  to: string;
}

export interface ReserveAppointmentDto {
  slotId: string;
  patientId?: string;
  reasonText?: string;
}

export interface AppointmentDto {
  id: string;
  tenantId: string;
  doctorId: string;
  patientId: string;
  serviceTypeId: string;
  slotId: string;
  status: AppointmentStatus;
  reasonText: string | null;
  startAt: string;
  endAt: string;
  paymentId: string | null;
  consultationSessionId: string | null;
  createdAt: string;
}

export interface CancelAppointmentDto {
  reason?: string;
}

export interface RescheduleAppointmentDto {
  newSlotId: string;
}
