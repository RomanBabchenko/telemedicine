import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus, SlotStatus } from '@telemed/shared-types';
import { Slot } from '../../../booking/domain/entities/slot.entity';
import { Appointment } from '../../../booking/domain/entities/appointment.entity';
import { MisAppointmentService } from '../mis-appointment.service';

const makeAppt = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'a-1',
    tenantId: 't-1',
    slotId: 'slot-old',
    doctorId: 'd-1',
    patientId: 'p-1',
    serviceTypeId: 'svc-1',
    status: AppointmentStatus.CONFIRMED,
    startAt: new Date('2026-05-01T10:00:00Z'),
    endAt: new Date('2026-05-01T10:30:00Z'),
    ...overrides,
  }) as unknown as Appointment;

interface BuildArgs {
  appt: Appointment;
  // Slot already in DB at the requested new time, or null to test "create new"
  existingNewSlot: Slot | null;
  // What `appointmentService.reschedule` should return (the post-swap row)
  rescheduledAppt: Appointment;
}

const build = (args: BuildArgs) => {
  const apptFindOne = jest
    .fn()
    // First call: resolveAppointment → original appt
    .mockResolvedValueOnce(args.appt)
    // Second call (after the swap): re-read returns rescheduledAppt
    .mockResolvedValueOnce(args.rescheduledAppt);

  const slotFindOne = jest.fn().mockResolvedValue(args.existingNewSlot);
  const slotSave = jest.fn(async (s: Slot) => ({ ...s, id: s.id ?? 'slot-new-created' }));

  const slotRepoInTxn = {
    findOne: slotFindOne,
    create: jest.fn((data: Partial<Slot>) => data as Slot),
    save: slotSave,
  };

  const dataSource = {
    transaction: jest.fn(async <T>(cb: (em: unknown) => Promise<T>) =>
      cb({ getRepository: jest.fn().mockReturnValue(slotRepoInTxn) }),
    ),
  };

  const appointmentService = { reschedule: jest.fn(async () => args.rescheduledAppt) };
  const invites = { extendForAppointment: jest.fn().mockResolvedValue(2) };

  const service = new MisAppointmentService(
    { findOne: apptFindOne } as never, // appointments repo
    {} as never, // externalIds (only used by external locator)
    {} as never, // slots repo (top-level — service uses em.getRepository instead)
    appointmentService as never,
    {} as never, // recordings
    invites as never,
    dataSource as never,
  );

  return { service, appointmentService, invites, slotRepoInTxn, slotFindOne };
};

describe('MisAppointmentService.reschedule', () => {
  it('reuses an existing slot at the new time and extends invite TTL', async () => {
    const newStartAt = new Date('2026-05-02T10:00:00Z');
    const newEndAt = new Date('2026-05-02T10:30:00Z');
    const existingNewSlot = {
      id: 'slot-existing',
      tenantId: 't-1',
      doctorId: 'd-1',
      serviceTypeId: 'svc-1',
      startAt: newStartAt,
      endAt: newEndAt,
      status: SlotStatus.OPEN,
      sourceIsMis: true,
      externalSlotId: 'ext-slot-1',
      heldUntil: null,
    } as unknown as Slot;
    const rescheduledAppt = makeAppt({
      slotId: 'slot-existing',
      startAt: newStartAt,
      endAt: newEndAt,
    });

    const { service, appointmentService, invites, slotRepoInTxn } = build({
      appt: makeAppt(),
      existingNewSlot,
      rescheduledAppt,
    });

    const dto = await service.reschedule(
      't-1',
      { kind: 'internal', appointmentId: 'a-1' },
      newStartAt,
      newEndAt,
      'patient asked',
      'docdream',
    );

    expect(dto).toEqual({
      ok: true,
      appointmentId: 'a-1',
      status: AppointmentStatus.CONFIRMED,
      startAt: newStartAt.toISOString(),
      endAt: newEndAt.toISOString(),
      invitesUpdated: 2,
    });

    // Reused the existing slot — never called create/save on a new one.
    expect(slotRepoInTxn.create).not.toHaveBeenCalled();
    expect(slotRepoInTxn.save).not.toHaveBeenCalled();

    expect(appointmentService.reschedule).toHaveBeenCalledWith(
      'a-1',
      'slot-existing',
      'patient asked',
    );
    expect(invites.extendForAppointment).toHaveBeenCalledWith('t-1', 'a-1', newEndAt);
  });

  it('creates a new MIS slot when none exists at the new time', async () => {
    const newStartAt = new Date('2026-05-03T10:00:00Z');
    const newEndAt = new Date('2026-05-03T10:30:00Z');
    const rescheduledAppt = makeAppt({ startAt: newStartAt, endAt: newEndAt });

    const { service, slotRepoInTxn, appointmentService } = build({
      appt: makeAppt(),
      existingNewSlot: null,
      rescheduledAppt,
    });

    await service.reschedule(
      't-1',
      { kind: 'internal', appointmentId: 'a-1' },
      newStartAt,
      newEndAt,
      undefined,
      'docdream',
    );

    // New slot persisted with the MIS flag and BOOKED status (mirrors the
    // create-appointment webhook's slot-find-or-create).
    expect(slotRepoInTxn.create).toHaveBeenCalledTimes(1);
    const created = slotRepoInTxn.create.mock.calls[0][0];
    expect(created.tenantId).toBe('t-1');
    expect(created.doctorId).toBe('d-1');
    expect(created.serviceTypeId).toBe('svc-1');
    expect(created.startAt).toEqual(newStartAt);
    expect(created.endAt).toEqual(newEndAt);
    expect(created.status).toBe(SlotStatus.BOOKED);
    expect(created.sourceIsMis).toBe(true);
    expect(created.externalSlotId).toMatch(/^reschedule-docdream-a-1-/);

    expect(appointmentService.reschedule).toHaveBeenCalled();
  });

  it('rejects when newEndAt is not after newStartAt', async () => {
    const start = new Date('2026-05-02T10:00:00Z');
    const { service, appointmentService } = build({
      appt: makeAppt(),
      existingNewSlot: null,
      rescheduledAppt: makeAppt(),
    });

    await expect(
      service.reschedule(
        't-1',
        { kind: 'internal', appointmentId: 'a-1' },
        start,
        start, // endAt === startAt → invalid
        undefined,
        'docdream',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Validation must happen BEFORE we touch the appointment service or
    // create a slot — otherwise we'd leave half-state behind on a bad input.
    expect(appointmentService.reschedule).not.toHaveBeenCalled();
  });
});
