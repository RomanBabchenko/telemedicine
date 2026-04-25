import { Patient } from '../../domain/entities/patient.entity';
import { Consent } from '../../domain/entities/consent.entity';
import { MedicalDocument } from '../../../documentation/domain/entities/medical-document.entity';
import { Doctor } from '../../../provider/domain/entities/doctor.entity';
import { PatientResponseDto } from '../dto/patient.response.dto';
import { ConsentResponseDto } from '../dto/consent.response.dto';
import { PatientDocumentResponseDto } from '../dto/patient-document.response.dto';
import { toAppointmentDoctorSummary } from '../../../booking/api/mappers/appointment.mapper';

export const toPatientResponse = (p: Patient): PatientResponseDto => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  dateOfBirth: p.dateOfBirth,
  gender: p.gender,
  email: p.email,
  phone: p.phone,
  preferredLocale: p.preferredLocale,
});

export const toConsentResponse = (c: Consent): ConsentResponseDto => ({
  id: c.id,
  type: c.type,
  status: c.status,
  versionCode: c.versionCode,
  grantedAt: c.grantedAt.toISOString(),
  withdrawnAt: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
});

export const toPatientDocumentResponse = (
  d: MedicalDocument,
  author: Doctor | undefined,
): PatientDocumentResponseDto => ({
  id: d.id,
  appointmentId: d.appointmentId,
  authorDoctorId: d.authorDoctorId,
  patientId: d.patientId,
  type: d.type,
  status: d.status,
  structuredContent: d.structuredContent,
  // Callers use GET /documents/:id/pdf to resolve a signed URL; the list
  // endpoint returns null so we don't mint a fresh URL per row.
  pdfUrl: null,
  signedAt: d.signedAt ? d.signedAt.toISOString() : null,
  version: d.version,
  parentDocumentId: d.parentDocumentId,
  createdAt: d.createdAt.toISOString(),
  doctor: author ? toAppointmentDoctorSummary(author) : undefined,
});
