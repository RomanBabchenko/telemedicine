import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, SlotStatus } from '@telemed/shared-types';
import { AppointmentService } from '../application/appointment.service';
import { Appointment } from '../domain/entities/appointment.entity';
import { Slot } from '../domain/entities/slot.entity';
import { AppointmentRescheduledEvent } from '../events/appointment.events';

// Stand-in factories so each test can mutate a fresh row without touching
// shared state. Cast to entity types — we only set the fields the service
// actually reads.
const makeAppt = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'a-1',
    tenantId: 't-1',
    slotId: 'old-slot',
    doctorId: 'd-1',
    patientId: 'p-1',
    serviceTypeId: 'svc-1',
    status: AppointmentStatus.CONFIRMED,
    startAt: new Date('2026-05-01T10:00:00Z'),
    endAt: new Date('2026-05-01T10:30:00Z'),
    ...overrides,
  }) as unknown as Appointment;

const makeSlot = (overrides: Partial<Slot> = {}): Slot =>
  ({
    id: 'new-slot',
    tenantId: 't-1',
    doctorId: 'd-1',
    serviceTypeId: 'svc-1',
    startAt: new Date('2026-05-02T10:00:00Z'),
    endAt: new Date('2026-05-02T10:30:00Z'),
    status: SlotStatus.OPEN,
    heldUntil: null,
    sourceIsMis: false,
    externalSlotId: null,
    ...overrides,
  }) as unknown as Slot;

interface MockState {
  appt: Appointment;
  newSlot: Slot;
  oldSlot: Slot;
  // null → no other appointment is using newSlotId (the happy path)
  conflictingAppt: Appointment | null;
}

/**
 * Build the AppointmentService with just enough mock plumbing to exercise
 * `reschedule`. Only the methods the service actually calls are mocked —
 * everything else is left undefined so an accidental dependency surfaces as
 * a clear "not a function" error instead of silently passing.
 */
const buildService = (state: MockState) => {
  const eventBus = { publish: jest.fn() };
  const apptSaveMock = jest.fn(async (e: Appointment) => e);
  const slotSaveMock = jest.fn(async (e: Slot) => e);

  const apptRepo = {
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(state.appt),
    })),
    findOne: jest.fn(async () => state.conflictingAppt),
    save: apptSaveMock,
  };

  const slotRepo = {
    createQueryBuilder: jest.fn((alias?: string) => {
      // Two pessimistic locks happen in reschedule — first on the new slot,
      // then on the old. We track the call order via the where clause to
      // return the right row.
      let pendingId: string | null = null;
      return {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn(function (this: { where: jest.Mock }, _sql: string, params: { id: string }) {
          pendingId = params.id;
          return this;
        }),
        getOne: jest.fn(async () => {
          if (pendingId === state.newSlot.id) return state.newSlot;
          if (pendingId === state.oldSlot.id) return state.oldSlot;
          return null;
        }),
      };
    }),
  };

  const em = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Appointment) return apptRepo;
      if (entity === Slot) return slotRepo;
      throw new Error(`Unexpected getRepository(${String(entity)})`);
    }),
    save: jest.fn(async <T>(e: T) => e),
  };

  const dataSource = {
    transaction: jest.fn(async <T>(cb: (em: unknown) => Promise<T>) => cb(em)),
  };

  // The other ctor deps are only invoked by sibling methods (reserve, confirm
  // etc.), not reschedule — pass `undefined as never` so we don't drag the
  // whole booking module into this test.
  const service = new AppointmentService(
    undefined as never, // appointments repo (unused)
    undefined as never, // slots repo (unused — service uses em.getRepository)
    undefined as never, // services repo
    undefined as never, // patients repo
    undefined as never, // tenantContext
    undefined as never, // slotHold
    eventBus as never,
    dataSource as never,
    undefined as never, // providerService
  );

  return { service, eventBus, em, apptRepo, slotRepo };
};

describe('AppointmentService.reschedule', () => {
  it('moves the appointment to the new slot, frees the old one, marks the new BOOKED', async () => {
    const oldSlot = makeSlot({ id: 'old-slot', status: SlotStatus.BOOKED });
    const newSlot = makeSlot({ id: 'new-slot', status: SlotStatus.OPEN });
    const appt = makeAppt({ slotId: 'old-slot' });
    const { service, eventBus, em } = buildService({
      appt,
      newSlot,
      oldSlot,
      conflictingAppt: null,
    });

    const result = await service.reschedule('a-1', 'new-slot', 'patient request');

    expect(result.slotId).toBe('new-slot');
    expect(result.startAt).toEqual(newSlot.startAt);
    expect(result.endAt).toEqual(newSlot.endAt);
    expect(result.status).toBe(AppointmentStatus.CONFIRMED); // status preserved

    // Slot lifecycle: old → OPEN, new → BOOKED, both saved via em.save
    expect(oldSlot.status).toBe(SlotStatus.OPEN);
    expect(oldSlot.heldUntil).toBeNull();
    expect(newSlot.status).toBe(SlotStatus.BOOKED);
    expect(em.save).toHaveBeenCalledWith(oldSlot);
    expect(em.save).toHaveBeenCalledWith(newSlot);

    // Event payload carries old AND new times so listeners can render diffs
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const event = eventBus.publish.mock.calls[0][0];
    expect(event).toBeInstanceOf(AppointmentRescheduledEvent);
    expect(event.oldStartAt).toEqual(new Date('2026-05-01T10:00:00Z'));
    expect(event.newStartAt).toEqual(newSlot.startAt);
    expect(event.reason).toBe('patient request');
  });

  it('rejects when the appointment is already in progress', async () => {
    const { service } = buildService({
      appt: makeAppt({ status: AppointmentStatus.IN_PROGRESS }),
      newSlot: makeSlot(),
      oldSlot: makeSlot({ id: 'old-slot' }),
      conflictingAppt: null,
    });
    await expect(service.reschedule('a-1', 'new-slot')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when the appointment is in a terminal state', async () => {
    const { service } = buildService({
      appt: makeAppt({ status: AppointmentStatus.COMPLETED }),
      newSlot: makeSlot(),
      oldSlot: makeSlot({ id: 'old-slot' }),
      conflictingAppt: null,
    });
    await expect(service.reschedule('a-1', 'new-slot')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when the new slot is the same as the current one', async () => {
    const { service } = buildService({
      appt: makeAppt({ slotId: 'same-slot' }),
      newSlot: makeSlot({ id: 'same-slot' }),
      oldSlot: makeSlot({ id: 'same-slot' }),
      conflictingAppt: null,
    });
    await expect(service.reschedule('a-1', 'same-slot')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when another appointment already occupies the target slot', async () => {
    const { service } = buildService({
      appt: makeAppt(),
      newSlot: makeSlot(),
      oldSlot: makeSlot({ id: 'old-slot' }),
      conflictingAppt: makeAppt({ id: 'a-other', slotId: 'new-slot' }),
    });
    await expect(service.reschedule('a-1', 'new-slot')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws NotFoundException when the appointment cannot be located', async () => {
    const { service, apptRepo } = buildService({
      appt: makeAppt(),
      newSlot: makeSlot(),
      oldSlot: makeSlot({ id: 'old-slot' }),
      conflictingAppt: null,
    });
    apptRepo.createQueryBuilder.mockReturnValueOnce({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    } as never);
    await expect(service.reschedule('missing', 'new-slot')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
