import { Prescription } from '../../domain/entities/prescription.entity';
import { Referral } from '../../domain/entities/referral.entity';
import { PrescriptionResponseDto } from '../dto/prescription.response.dto';
import { ReferralResponseDto } from '../dto/referral.response.dto';

export const toPrescriptionResponse = (p: Prescription): PrescriptionResponseDto => ({
  id: p.id,
  tenantId: p.tenantId,
  appointmentId: p.appointmentId,
  doctorId: p.doctorId,
  patientId: p.patientId,
  items: p.items,
  status: p.status,
  pdfFileAssetId: p.pdfFileAssetId,
  signedAt: p.signedAt ? p.signedAt.toISOString() : null,
  createdAt: p.createdAt.toISOString(),
});

export const toReferralResponse = (r: Referral): ReferralResponseDto => ({
  id: r.id,
  tenantId: r.tenantId,
  appointmentId: r.appointmentId,
  doctorId: r.doctorId,
  patientId: r.patientId,
  targetType: r.targetType,
  instructions: r.instructions,
  status: r.status,
  pdfFileAssetId: r.pdfFileAssetId,
  createdAt: r.createdAt.toISOString(),
});
