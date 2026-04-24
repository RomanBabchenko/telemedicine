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
  // When isAnonymousPatient=true, every patient* field below is ignored and
  // no User/Patient row is created on our side — the invite URL resolves to
  // a stateless, session-scoped JWT. See consultation-invite.service for the
  // anonymous token path. Kept optional for the legacy named flow.
  patientExternalId?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientEmail?: string;
  patientPhone?: string;
  doctorFirstName: string;
  doctorLastName: string;
  doctorSpecialization: string;
  startAt: string;
  endAt: string;
  serviceTypeName?: string;
  // MIS-controlled payment flow.
  //   postpaid (default): patient can join immediately.
  //   prepaid + paid: same as postpaid — appointment is CONFIRMED.
  //   prepaid + unpaid: appointment is AWAITING_PAYMENT — patient is blocked
  //     from joining until the clinic calls the payment-status endpoint.
  paymentType?: 'prepaid' | 'postpaid';
  paymentStatus?: 'paid' | 'unpaid';
  // Anonymous-patient mode: the MIS does not share any PII about the patient.
  // Appointment gets patient_id=null + is_anonymous_patient=true; the patient
  // invite JWT is issued with scope='invite-anon' and sub=null.
  isAnonymousPatient?: boolean;
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
