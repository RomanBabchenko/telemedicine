import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@telemed/shared-types';
import { AppointmentService } from '../application/appointment.service';
import { Appointment } from '../domain/entities/appointment.entity';
import { AppointmentCompletedEvent } from '../events/appointment.events';

const build = (status: AppointmentStatus) => {
  const appt = { id: 'a-1', tenantId: 't-1', status } as unknown as Appointment;
  const eventBus = { publish: jest.fn() };
  const repo = {
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(appt),
    })),
    save: jest.fn(async (e: Appointment) => e),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: (em: unknown) => unknown) => fn({ getRepository: () => repo })),
  };
  const service = new AppointmentService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    eventBus as never,
    dataSource as never,
    {} as never,
  );
  return { service, appt, eventBus };
};

describe('AppointmentService.complete', () => {
  it('moves IN_PROGRESS to COMPLETED and publishes AppointmentCompletedEvent', async () => {
    const { service, appt, eventBus } = build(AppointmentStatus.IN_PROGRESS);
    const result = await service.complete('a-1');
    expect(result.status).toBe(AppointmentStatus.COMPLETED);
    expect(appt.status).toBe(AppointmentStatus.COMPLETED);
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(AppointmentCompletedEvent));
  });

  it('rejects an already completed appointment without publishing', async () => {
    const { service, eventBus } = build(AppointmentStatus.COMPLETED);
    await expect(service.complete('a-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
