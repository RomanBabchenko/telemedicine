import { MedicalDocument } from '../../domain/entities/medical-document.entity';
import { MedicalDocumentResponseDto } from '../dto/medical-document.response.dto';

export const toMedicalDocumentResponse = (
  d: MedicalDocument,
): MedicalDocumentResponseDto => ({
  id: d.id,
  tenantId: d.tenantId,
  appointmentId: d.appointmentId,
  authorDoctorId: d.authorDoctorId,
  patientId: d.patientId,
  type: d.type,
  status: d.status,
  structuredContent: d.structuredContent,
  pdfFileAssetId: d.pdfFileAssetId,
  parentDocumentId: d.parentDocumentId,
  version: d.version,
  signedAt: d.signedAt ? d.signedAt.toISOString() : null,
  createdAt: d.createdAt.toISOString(),
});
