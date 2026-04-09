import { DocumentStatus, DocumentType, ReferralTargetType } from './enums';

export interface MedicalDocumentDoctorSummary {
  firstName: string;
  lastName: string;
  specializations: string[];
}

export interface MedicalDocumentDto {
  id: string;
  appointmentId: string;
  authorDoctorId: string;
  patientId: string;
  type: DocumentType;
  status: DocumentStatus;
  structuredContent: Record<string, unknown>;
  pdfUrl: string | null;
  signedAt: string | null;
  version: number;
  parentDocumentId: string | null;
  createdAt: string;
  // Joined for the patient list view so we don't have to fan out per row.
  doctor?: MedicalDocumentDoctorSummary;
}

export interface CreateConclusionDto {
  templateId?: string;
  diagnosis: string;
  recommendations: string;
  notes?: string;
  followUpInDays?: number;
}

export interface PrescriptionItemDto {
  drug: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  notes?: string;
}

export interface PrescriptionDto {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  items: PrescriptionItemDto[];
  status: DocumentStatus;
  pdfUrl: string | null;
  signedAt: string | null;
  createdAt: string;
}

export interface CreatePrescriptionDto {
  items: PrescriptionItemDto[];
}

export interface ReferralDto {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  targetType: ReferralTargetType;
  instructions: string;
  status: DocumentStatus;
  pdfUrl: string | null;
  createdAt: string;
}

export interface CreateReferralDto {
  targetType: ReferralTargetType;
  instructions: string;
}

export interface DocumentTemplateDto {
  id: string;
  specialization: string;
  type: DocumentType;
  schema: Record<string, unknown>;
  defaultValues: Record<string, unknown>;
}
