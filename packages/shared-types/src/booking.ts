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

export interface AppointmentPatientSummary {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export interface AppointmentDoctorSummary {
  firstName: string;
  lastName: string;
  specializations: string[];
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
  // MIS-originated payment fields. Set only when the appointment was created
  // via an MIS webhook (e.g. DocDream) with explicit payment instructions.
  // When misPaymentType === 'prepaid' and misPaymentStatus !== 'paid', the
  // patient is blocked from joining the video session until the clinic marks
  // the appointment as paid.
  misPaymentType?: 'prepaid' | 'postpaid' | null;
  misPaymentStatus?: 'paid' | 'unpaid' | null;
  // Joined summaries — populated by list endpoints so admin/doctor UIs
  // don't have to make N+1 follow-up requests. Optional for backwards
  // compatibility with reserve/confirm/cancel responses that still return
  // a bare appointment row.
  patient?: AppointmentPatientSummary;
  doctor?: AppointmentDoctorSummary;
}

export interface CancelAppointmentDto {
  reason?: string;
}

export interface RescheduleAppointmentDto {
  newSlotId: string;
}
