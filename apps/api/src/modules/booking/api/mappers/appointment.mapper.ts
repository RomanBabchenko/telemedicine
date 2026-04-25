import { Appointment } from '../../domain/entities/appointment.entity';
import { Doctor } from '../../../provider/domain/entities/doctor.entity';
import { Patient } from '../../../patient/domain/entities/patient.entity';
import {
  AppointmentDoctorSummaryDto,
  AppointmentPatientSummaryDto,
  AppointmentResponseDto,
} from '../dto/appointment.response.dto';

export const toAppointmentResponse = (a: Appointment): AppointmentResponseDto => ({
  id: a.id,
  tenantId: a.tenantId,
  doctorId: a.doctorId,
  patientId: a.patientId,
  isAnonymousPatient: a.isAnonymousPatient ?? false,
  serviceTypeId: a.serviceTypeId,
  slotId: a.slotId,
  status: a.status,
  reasonText: a.reasonText,
  startAt: a.startAt.toISOString(),
  endAt: a.endAt.toISOString(),
  paymentId: a.paymentId,
  consultationSessionId: a.consultationSessionId,
  createdAt: a.createdAt.toISOString(),
  misPaymentType: a.misPaymentType ?? null,
  misPaymentStatus: a.misPaymentStatus ?? null,
});

export const toAppointmentPatientSummary = (
  patient: Patient,
): AppointmentPatientSummaryDto => ({
  firstName: patient.firstName,
  lastName: patient.lastName,
  phone: patient.phone ?? null,
  email: patient.email ?? null,
});

export const toAppointmentDoctorSummary = (doctor: Doctor): AppointmentDoctorSummaryDto => ({
  firstName: doctor.firstName,
  lastName: doctor.lastName,
  specializations: doctor.specializations,
});

export const toAppointmentResponseWithSummaries = (
  a: Appointment,
  patient: Patient | undefined,
  doctor: Doctor | undefined,
): AppointmentResponseDto => ({
  ...toAppointmentResponse(a),
  patient: patient ? toAppointmentPatientSummary(patient) : undefined,
  doctor: doctor ? toAppointmentDoctorSummary(doctor) : undefined,
});
