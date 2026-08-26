import type { AppointmentSource } from './enums';
import { AppointmentStatus, ServiceMode, SlotStatus } from './enums';

// Admin-UI labels for AppointmentDto.source.
export const APPOINTMENT_SOURCE_LABELS: Record<AppointmentSource, string> = {
  PLATFORM: 'Платформа',
  MIS: 'МІС',
};

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
  // null for anonymous-patient appointments (isAnonymousPatient === true).
  patientId: string | null;
  // True when the appointment was created via an anonymous MIS webhook —
  // there is no Patient row and no PII. UI uses this to hide name/contact
  // widgets and the prescription/referral finish flow.
  isAnonymousPatient?: boolean;
  serviceTypeId: string;
  slotId: string;
  // PLATFORM — booked through the marketplace / widget / admin console;
  // MIS — created by an external MIS webhook (DocDream). INTEGRATION_ADMIN
  // only ever sees MIS rows.
  source: AppointmentSource;
  status: AppointmentStatus;
  reasonText: string | null;
  startAt: string;
  endAt: string;
  paymentId: string | null;
  consultationSessionId: string | null;
  // True when a merged recording is STORED and downloadable — set by the
  // list endpoint so tables can show a reliable indicator.
  hasRecording?: boolean;
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

// Response of the admin invite reissue endpoint
// (POST /appointments/:id/invites) — old links are revoked.
export interface ReissueInvitesDto {
  appointmentId: string;
  consultationSessionId: string;
  patientInviteUrl: string;
  doctorInviteUrl: string;
}

export interface CancelAppointmentDto {
  reason?: string;
}

export interface RescheduleAppointmentDto {
  newSlotId: string;
}
