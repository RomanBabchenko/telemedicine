export interface ExternalDoctor {
  externalId: string;
  firstName: string;
  lastName: string;
  specialization: string;
  languages: string[];
  yearsOfExperience: number;
  basePrice: number;
}

export interface ExternalPatient {
  externalId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface ExternalServiceType {
  externalId: string;
  doctorExternalId: string;
  name: string;
  durationMin: number;
  price: number;
}

export interface ExternalSlot {
  externalId: string;
  doctorExternalId: string;
  serviceTypeExternalId: string;
  startAt: string;
  endAt: string;
}

export interface OnlineAppointmentPayload {
  externalAppointmentId?: string;
  doctorExternalId: string;
  patientExternalId?: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail?: string;
  patientPhone?: string;
  doctorFirstName: string;
  doctorLastName: string;
  doctorSpecialization: string;
  startAt: string;
  endAt: string;
  serviceTypeName?: string;
}

export interface NormalizedMisEvent {
  type: 'appointment.status' | 'slot.updated' | 'appointment.online';
  payload: Record<string, unknown>;
}

export interface MisConnector {
  readonly id: string;
  listDoctors(): Promise<ExternalDoctor[]>;
  listPatients(): Promise<ExternalPatient[]>;
  listServiceTypes(): Promise<ExternalServiceType[]>;
  listSlots(from: Date, to: Date): Promise<ExternalSlot[]>;
  reserveSlot(externalSlotId: string, payload: Record<string, unknown>): Promise<{ externalAppointmentId: string }>;
  updateAppointmentStatus(externalAppointmentId: string, status: string): Promise<void>;
  verifyWebhookSignature(headers: Record<string, string>, body: string | Buffer): boolean;
  parseWebhookEvent(body: string | Buffer): NormalizedMisEvent | null;
}
