import { ForbiddenException } from '@nestjs/common';
import { AppointmentSource, Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { BookingController } from '../api/booking.controller';

const actor = (roles: Role[]): AuthUser =>
  ({ id: 'u', email: 'a@x.test', phone: null, roles, tenantId: 't', mfaEnabled: false }) as AuthUser;

const build = () => {
  const appointments = {
    listForRole: jest.fn().mockResolvedValue([]),
    getByIdWithSummaries: jest.fn(),
    getById: jest.fn(),
    cancel: jest.fn(),
  };
  const recordings = { find: jest.fn().mockResolvedValue([]) };
  const ctrl = new BookingController(
    {} as never,
    appointments as never,
    {} as never,
    {} as never,
    recordings as never,
  );
  return { ctrl, appointments };
};

describe('BookingController — MIS scoping for INTEGRATION_ADMIN', () => {
  describe('GET /appointments', () => {
    it('INTEGRATION_ADMIN only receives MIS-originated appointments', async () => {
      const { ctrl, appointments } = build();
      await ctrl.list(actor([Role.INTEGRATION_ADMIN]));
      expect(appointments.listForRole).toHaveBeenCalledWith({ source: AppointmentSource.MIS });
    });

    it('CHIEF_MEDICAL_OFFICER receives every appointment in the tenant', async () => {
      const { ctrl, appointments } = build();
      await ctrl.list(actor([Role.CHIEF_MEDICAL_OFFICER]));
      expect(appointments.listForRole).toHaveBeenCalledWith({});
    });

    it('CLINIC_ADMIN + INTEGRATION_ADMIN is not scoped', async () => {
      const { ctrl, appointments } = build();
      await ctrl.list(actor([Role.INTEGRATION_ADMIN, Role.CLINIC_ADMIN]));
      expect(appointments.listForRole).toHaveBeenCalledWith({});
    });
  });

  describe('GET /appointments/:id', () => {
    it('INTEGRATION_ADMIN gets 403 for a PLATFORM appointment', async () => {
      const { ctrl, appointments } = build();
      appointments.getByIdWithSummaries.mockResolvedValue({ id: 'a', source: AppointmentSource.PLATFORM });
      await expect(ctrl.getById('a', actor([Role.INTEGRATION_ADMIN]))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('INTEGRATION_ADMIN can read a MIS appointment', async () => {
      const { ctrl, appointments } = build();
      appointments.getByIdWithSummaries.mockResolvedValue({ id: 'a', source: AppointmentSource.MIS });
      await expect(ctrl.getById('a', actor([Role.INTEGRATION_ADMIN]))).resolves.toMatchObject({ id: 'a' });
    });

    it('CHIEF_MEDICAL_OFFICER can read a PLATFORM appointment', async () => {
      const { ctrl, appointments } = build();
      appointments.getByIdWithSummaries.mockResolvedValue({ id: 'a', source: AppointmentSource.PLATFORM });
      await expect(ctrl.getById('a', actor([Role.CHIEF_MEDICAL_OFFICER]))).resolves.toMatchObject({ id: 'a' });
    });

    it('invite-scoped callers (no roles) are not affected', async () => {
      const { ctrl, appointments } = build();
      appointments.getByIdWithSummaries.mockResolvedValue({ id: 'a', source: AppointmentSource.PLATFORM });
      const invite = { ...actor([]), scope: 'invite' } as AuthUser;
      await expect(ctrl.getById('a', invite)).resolves.toMatchObject({ id: 'a' });
    });
  });

  describe('POST /appointments/:id/cancel', () => {
    it('INTEGRATION_ADMIN cannot cancel a PLATFORM appointment', async () => {
      const { ctrl, appointments } = build();
      appointments.getById.mockResolvedValue({ id: 'a', source: AppointmentSource.PLATFORM });
      await expect(
        ctrl.cancel(actor([Role.INTEGRATION_ADMIN]), 'a', { reason: 'x' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(appointments.cancel).not.toHaveBeenCalled();
    });

    it('INTEGRATION_ADMIN cancels a MIS appointment as provider', async () => {
      const { ctrl, appointments } = build();
      appointments.getById.mockResolvedValue({ id: 'a', source: AppointmentSource.MIS });
      appointments.cancel.mockResolvedValue({
        id: 'a',
        source: AppointmentSource.MIS,
        startAt: new Date(),
        endAt: new Date(),
        createdAt: new Date(),
      });
      await ctrl.cancel(actor([Role.INTEGRATION_ADMIN]), 'a', { reason: 'x' } as never);
      expect(appointments.cancel).toHaveBeenCalledWith('a', false, 'x');
    });
  });
});
