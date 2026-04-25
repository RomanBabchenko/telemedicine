import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitAppointmentBodyDto } from '../submit-appointment.body.dto';

const baseDoctorAndTime = {
  externalAppointmentId: 'mis-appt-1',
  doctorExternalId: 'doc-1',
  doctorFirstName: 'Анна',
  doctorLastName: 'Коваленко',
  doctorSpecialization: 'Кардіологія',
  startAt: '2026-04-25T09:00:00Z',
  endAt: '2026-04-25T09:30:00Z',
  paymentType: 'postpaid' as const,
  paymentStatus: 'unpaid' as const,
};

const namedPatient = {
  patientExternalId: 'mis-pat-77',
  patientFirstName: 'Петро',
  patientLastName: 'Іваненко',
  patientEmail: 'petro@example.com',
};

const validateDto = async (input: object) => {
  const dto = plainToInstance(SubmitAppointmentBodyDto, input);
  return validate(dto);
};

const constraintKeys = (errors: Awaited<ReturnType<typeof validateDto>>): string[] =>
  errors.flatMap((e) => Object.keys(e.constraints ?? {}));

describe('SubmitAppointmentBodyDto', () => {
  describe('anonymous mode', () => {
    it('passes with no patient fields', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        isAnonymousPatient: true,
      });
      expect(errors).toHaveLength(0);
    });

    it('passes even when patient fields are present (handler logs a warning)', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
        isAnonymousPatient: true,
      });
      expect(errors).toHaveLength(0);
    });

    it('does not require any contact channel', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        isAnonymousPatient: true,
      });
      expect(constraintKeys(errors)).not.toContain('atLeastOneOf');
    });
  });

  describe('named mode — required identity fields', () => {
    it('rejects missing patientExternalId', async () => {
      const { patientExternalId: _, ...rest } = namedPatient;
      const errors = await validateDto({ ...baseDoctorAndTime, ...rest });
      expect(errors.some((e) => e.property === 'patientExternalId')).toBe(true);
    });

    it('rejects missing patientFirstName', async () => {
      const { patientFirstName: _, ...rest } = namedPatient;
      const errors = await validateDto({ ...baseDoctorAndTime, ...rest });
      expect(errors.some((e) => e.property === 'patientFirstName')).toBe(true);
    });

    it('rejects missing patientLastName', async () => {
      const { patientLastName: _, ...rest } = namedPatient;
      const errors = await validateDto({ ...baseDoctorAndTime, ...rest });
      expect(errors.some((e) => e.property === 'patientLastName')).toBe(true);
    });
  });

  describe('named mode — at-least-one contact', () => {
    it('rejects when both patientEmail and patientPhone are absent', async () => {
      const { patientEmail: _, ...rest } = namedPatient;
      const errors = await validateDto({ ...baseDoctorAndTime, ...rest });
      expect(constraintKeys(errors)).toContain('atLeastOneOf');
    });

    it('passes with only patientEmail', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
      });
      expect(errors).toHaveLength(0);
    });

    it('passes with only patientPhone', async () => {
      const { patientEmail: _, ...rest } = namedPatient;
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...rest,
        patientPhone: '+380501234567',
      });
      expect(errors).toHaveLength(0);
    });

    it('passes with both', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
        patientPhone: '+380501234567',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('named mode — format checks', () => {
    it('rejects malformed patientEmail even when patientPhone is present', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
        patientEmail: 'not-an-email',
        patientPhone: '+380501234567',
      });
      expect(errors.some((e) => e.property === 'patientEmail')).toBe(true);
    });

    it('rejects malformed patientPhone even when patientEmail is present', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
        patientPhone: 'abc',
      });
      expect(errors.some((e) => e.property === 'patientPhone')).toBe(true);
    });

    it('rejects non-ISO startAt', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
        startAt: 'tomorrow',
      });
      expect(errors.some((e) => e.property === 'startAt')).toBe(true);
    });

    it('rejects unknown paymentType enum value', async () => {
      const errors = await validateDto({
        ...baseDoctorAndTime,
        ...namedPatient,
        paymentType: 'invoice',
      });
      expect(errors.some((e) => e.property === 'paymentType')).toBe(true);
    });
  });

  describe('doctor fields (always required)', () => {
    it('rejects missing doctorExternalId in either mode', async () => {
      const { doctorExternalId: _, ...rest } = baseDoctorAndTime;
      const anon = await validateDto({ ...rest, isAnonymousPatient: true });
      const named = await validateDto({ ...rest, ...namedPatient });
      expect(anon.some((e) => e.property === 'doctorExternalId')).toBe(true);
      expect(named.some((e) => e.property === 'doctorExternalId')).toBe(true);
    });
  });

  describe('MIS contract fields (always required)', () => {
    it('rejects missing externalAppointmentId', async () => {
      const { externalAppointmentId: _, ...rest } = baseDoctorAndTime;
      const errors = await validateDto({ ...rest, isAnonymousPatient: true });
      expect(errors.some((e) => e.property === 'externalAppointmentId')).toBe(true);
    });

    it('rejects missing paymentType', async () => {
      const { paymentType: _, ...rest } = baseDoctorAndTime;
      const errors = await validateDto({ ...rest, isAnonymousPatient: true });
      expect(errors.some((e) => e.property === 'paymentType')).toBe(true);
    });

    it('rejects missing paymentStatus', async () => {
      const { paymentStatus: _, ...rest } = baseDoctorAndTime;
      const errors = await validateDto({ ...rest, isAnonymousPatient: true });
      expect(errors.some((e) => e.property === 'paymentStatus')).toBe(true);
    });
  });
});
