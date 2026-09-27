import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentSource, Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { FeedbackController } from '../api/feedback.controller';

const actor = (roles: Role[]): AuthUser =>
  ({
    id: 'u',
    email: 'a@x.test',
    phone: null,
    roles,
    tenantId: 't',
    mfaEnabled: false,
  }) as AuthUser;

const ROW = {
  id: 'f-1',
  appointmentId: 'a-1',
  resolved: 'PARTIALLY',
  clarityRating: 3,
  submittedAt: new Date('2026-09-22T10:00:00Z'),
};

const build = () => {
  const service = {
    submit: jest.fn().mockResolvedValue(ROW),
    findByAppointmentId: jest.fn().mockResolvedValue(ROW),
  };
  const appointments = { getById: jest.fn() };
  const ctrl = new FeedbackController(service as never, appointments as never);
  return { ctrl, service, appointments };
};

describe('POST /appointments/:id/feedback', () => {
  it('maps the saved row to the response DTO', async () => {
    const { ctrl, service } = build();
    const user = actor([Role.PATIENT]);
    const body = { resolved: 'PARTIALLY' as const, clarityRating: 3 as const };
    await expect(ctrl.submit('a-1', body, user)).resolves.toEqual({
      appointmentId: 'a-1',
      resolved: 'PARTIALLY',
      clarityRating: 3,
      submittedAt: '2026-09-22T10:00:00.000Z',
    });
    expect(service.submit).toHaveBeenCalledWith('a-1', user, body);
  });
});

describe('GET /appointments/:id/feedback — role scoping', () => {
  it('INTEGRATION_ADMIN is refused for a PLATFORM appointment', async () => {
    const { ctrl, service, appointments } = build();
    appointments.getById.mockResolvedValue({ source: AppointmentSource.PLATFORM });
    await expect(
      ctrl.getForAppointment('a-1', actor([Role.INTEGRATION_ADMIN])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.findByAppointmentId).not.toHaveBeenCalled();
  });

  it('INTEGRATION_ADMIN reads feedback of a MIS appointment', async () => {
    const { ctrl, appointments } = build();
    appointments.getById.mockResolvedValue({ source: AppointmentSource.MIS });
    await expect(
      ctrl.getForAppointment('a-1', actor([Role.INTEGRATION_ADMIN])),
    ).resolves.toMatchObject({
      appointmentId: 'a-1',
      clarityRating: 3,
    });
  });

  it('CHIEF_MEDICAL_OFFICER is not source-scoped', async () => {
    const { ctrl, appointments } = build();
    await expect(
      ctrl.getForAppointment('a-1', actor([Role.CHIEF_MEDICAL_OFFICER])),
    ).resolves.toMatchObject({
      resolved: 'PARTIALLY',
    });
    expect(appointments.getById).not.toHaveBeenCalled();
  });

  it('404 when the patient has not answered', async () => {
    const { ctrl, service } = build();
    service.findByAppointmentId.mockResolvedValue(null);
    await expect(ctrl.getForAppointment('a-1', actor([Role.CLINIC_ADMIN]))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
