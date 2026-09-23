import { ForbiddenException } from '@nestjs/common';
import { AppointmentSource, Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../common/auth/decorators';
import { BookingController } from '../api/booking.controller';

const actor = (roles: Role[]): AuthUser =>
  ({ id: 'u', email: 'a@x.test', phone: null, roles, tenantId: 't', mfaEnabled: false }) as AuthUser;

const build = () => {
  const appointments = {
    listForRole: jest.fn().mockResolvedValue([]),
    listPaged: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getByIdWithSummaries: jest.fn(),
    getById: jest.fn(),
    cancel: jest.fn(),
  };
  const recordings = { find: jest.fn().mockResolvedValue([]) };
  const feedbacks = { find: jest.fn().mockResolvedValue([]) };
  const ctrl = new BookingController(
    {} as never,
    appointments as never,
    {} as never,
    {} as never,
    recordings as never,
    feedbacks as never,
  );
  return { ctrl, appointments, feedbacks };
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

  describe('GET /appointments/admin/list', () => {
    it('INTEGRATION_ADMIN is pinned to MIS rows even when asking for PLATFORM', async () => {
      const { ctrl, appointments } = build();
      await ctrl.adminList({ source: AppointmentSource.PLATFORM }, actor([Role.INTEGRATION_ADMIN]));
      expect(appointments.listPaged).toHaveBeenCalledWith(
        expect.objectContaining({ source: AppointmentSource.MIS }),
      );
    });

    it('forwards the patient-feedback filters to listPaged', async () => {
      const { ctrl, appointments } = build();
      await ctrl.adminList(
        { feedback: 'rated', clarityRating: 2, resolved: 'NO', sort: 'rating', order: 'asc' },
        actor([Role.CLINIC_ADMIN]),
      );
      expect(appointments.listPaged).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: 'rated',
          clarityRating: 2,
          resolved: 'NO',
          sort: 'rating',
          order: 'asc',
        }),
      );
    });

    it('decorates rows with the feedback summary from one batched lookup', async () => {
      const { ctrl, appointments, feedbacks } = build();
      appointments.listPaged.mockResolvedValueOnce({
        items: [
          { id: 'a-1', consultationSessionId: null },
          { id: 'a-2', consultationSessionId: null },
        ],
        total: 2,
      });
      feedbacks.find.mockResolvedValueOnce([
        {
          appointmentId: 'a-2',
          resolved: 'YES',
          clarityRating: 5,
          submittedAt: new Date('2026-09-22T10:00:00Z'),
          submittedByUserId: 'u-secret',
        },
      ]);
      const res = await ctrl.adminList({}, actor([Role.CHIEF_MEDICAL_OFFICER]));
      expect(feedbacks.find).toHaveBeenCalledTimes(1);
      expect(res.items[0]).not.toHaveProperty('feedback');
      expect(res.items[1].feedback).toEqual({
        resolved: 'YES',
        clarityRating: 5,
        submittedAt: '2026-09-22T10:00:00.000Z',
      });
    });

    it('CLINIC_ADMIN keeps the requested source filter and gets a page envelope', async () => {
      const { ctrl, appointments } = build();
      appointments.listPaged.mockResolvedValueOnce({ items: [], total: 41 });
      const res = await ctrl.adminList({ page: 3, pageSize: 20 }, actor([Role.CLINIC_ADMIN]));
      expect(appointments.listPaged).toHaveBeenCalledWith(
        expect.objectContaining({ source: undefined, page: 3, pageSize: 20 }),
      );
      expect(res.meta).toEqual({ total: 41, page: 3, limit: 20, pageCount: 3 });
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
