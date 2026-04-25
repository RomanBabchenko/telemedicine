import { AppointmentStatus } from '@telemed/shared-types';
import {
  toAppointmentDoctorSummary,
  toAppointmentPatientSummary,
  toAppointmentResponse,
  toAppointmentResponseWithSummaries,
} from '../appointment.mapper';

const buildAppointment = () =>
  ({
    id: 'a-1',
    tenantId: 't-1',
    doctorId: 'd-1',
    patientId: 'p-1',
    isAnonymousPatient: false,
    serviceTypeId: 's-1',
    slotId: 'sl-1',
    status: AppointmentStatus.CONFIRMED,
    reasonText: 'headache',
    startAt: new Date('2026-05-01T10:00:00.000Z'),
    endAt: new Date('2026-05-01T10:30:00.000Z'),
    paymentId: 'pm-1',
    consultationSessionId: null,
    createdAt: new Date('2026-04-20T08:00:00.000Z'),
    misPaymentType: null,
    misPaymentStatus: null,
  }) as unknown as Parameters<typeof toAppointmentResponse>[0];

describe('appointment mapper', () => {
  it('serialises all date fields as ISO strings', () => {
    const dto = toAppointmentResponse(buildAppointment());
    expect(dto.startAt).toBe('2026-05-01T10:00:00.000Z');
    expect(dto.endAt).toBe('2026-05-01T10:30:00.000Z');
    expect(dto.createdAt).toBe('2026-04-20T08:00:00.000Z');
  });

  it('defaults isAnonymousPatient to false when missing', () => {
    const appt = buildAppointment();
    delete (appt as unknown as { isAnonymousPatient?: boolean }).isAnonymousPatient;
    const dto = toAppointmentResponse(appt);
    expect(dto.isAnonymousPatient).toBe(false);
  });

  it('builds the patient summary with null-safe phone/email', () => {
    const summary = toAppointmentPatientSummary({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: undefined,
      email: 'a@b.test',
    } as unknown as Parameters<typeof toAppointmentPatientSummary>[0]);
    expect(summary).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: null,
      email: 'a@b.test',
    });
  });

  it('builds the doctor summary', () => {
    const summary = toAppointmentDoctorSummary({
      firstName: 'Grace',
      lastName: 'Hopper',
      specializations: ['compiler-design'],
    } as unknown as Parameters<typeof toAppointmentDoctorSummary>[0]);
    expect(summary.specializations).toEqual(['compiler-design']);
  });

  it('leaves patient/doctor undefined when either is missing', () => {
    const dto = toAppointmentResponseWithSummaries(buildAppointment(), undefined, undefined);
    expect(dto.patient).toBeUndefined();
    expect(dto.doctor).toBeUndefined();
  });
});
