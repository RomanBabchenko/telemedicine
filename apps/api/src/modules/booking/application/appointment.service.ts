import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppointmentStatus, SlotStatus } from '@telemed/shared-types';
import { Slot } from '../domain/entities/slot.entity';
import { Appointment } from '../domain/entities/appointment.entity';
import { ServiceType } from '../domain/entities/service-type.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { Doctor } from '../../provider/domain/entities/doctor.entity';
import { ProviderService } from '../../provider/application/provider.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppointmentResponseDto } from '../api/dto/appointment.response.dto';
import { toAppointmentResponseWithSummaries } from '../api/mappers/appointment.mapper';
import { SlotHoldService } from './slot-hold.service';
import {
  AppointmentCancelledEvent,
  AppointmentCompletedEvent,
  AppointmentConfirmedEvent,
  AppointmentRescheduledEvent,
  AppointmentReservedEvent,
} from '../events/appointment.events';

const TERMINAL_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DOCUMENTATION_COMPLETED,
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.CANCELLED_BY_PROVIDER,
  AppointmentStatus.NO_SHOW_PATIENT,
  AppointmentStatus.NO_SHOW_PROVIDER,
  AppointmentStatus.REFUNDED,
]);

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.DRAFT]: [AppointmentStatus.RESERVED, AppointmentStatus.CANCELLED_BY_PATIENT],
  [AppointmentStatus.RESERVED]: [
    AppointmentStatus.AWAITING_PAYMENT,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED_BY_PATIENT,
    AppointmentStatus.CANCELLED_BY_PROVIDER,
  ],
  [AppointmentStatus.AWAITING_PAYMENT]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED_BY_PATIENT,
    AppointmentStatus.CANCELLED_BY_PROVIDER,
  ],
  [AppointmentStatus.CONFIRMED]: [
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.CANCELLED_BY_PATIENT,
    AppointmentStatus.CANCELLED_BY_PROVIDER,
    AppointmentStatus.NO_SHOW_PATIENT,
    AppointmentStatus.NO_SHOW_PROVIDER,
  ],
  [AppointmentStatus.IN_PROGRESS]: [
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW_PATIENT,
    AppointmentStatus.NO_SHOW_PROVIDER,
  ],
  [AppointmentStatus.COMPLETED]: [AppointmentStatus.DOCUMENTATION_PENDING],
  [AppointmentStatus.DOCUMENTATION_PENDING]: [AppointmentStatus.DOCUMENTATION_COMPLETED],
  [AppointmentStatus.DOCUMENTATION_COMPLETED]: [],
  [AppointmentStatus.CANCELLED_BY_PATIENT]: [AppointmentStatus.REFUNDED],
  [AppointmentStatus.CANCELLED_BY_PROVIDER]: [AppointmentStatus.REFUNDED],
  [AppointmentStatus.NO_SHOW_PATIENT]: [],
  [AppointmentStatus.NO_SHOW_PROVIDER]: [AppointmentStatus.REFUNDED],
  [AppointmentStatus.REFUNDED]: [],
  [AppointmentStatus.DISPUTED]: [],
};

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Slot) private readonly slots: Repository<Slot>,
    @InjectRepository(ServiceType) private readonly services: Repository<ServiceType>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly tenantContext: TenantContextService,
    private readonly slotHold: SlotHoldService,
    private readonly eventBus: EventBus,
    private readonly dataSource: DataSource,
    private readonly providerService: ProviderService,
  ) {}

  async listForRole(filters: {
    patientId?: string;
    doctorId?: string;
  }): Promise<AppointmentResponseDto[]> {
    const tenantId = this.tenantContext.getTenantId();
    const where: Record<string, unknown> = { tenantId };
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.doctorId) where.doctorId = filters.doctorId;
    const rows = await this.appointments.find({ where, order: { startAt: 'DESC' } });
    if (rows.length === 0) return [];

    // Anonymous appointments have patient_id=null — skip those when building
    // the patient lookup (In([...null]) would throw in TypeORM).
    const patientIds = Array.from(
      new Set(rows.map((r) => r.patientId).filter((id): id is string => !!id)),
    );
    const doctorIds = Array.from(new Set(rows.map((r) => r.doctorId)));

    const [patientRows, doctorMap]: [Patient[], Map<string, Doctor>] = await Promise.all([
      patientIds.length > 0
        ? this.patients.find({ where: { id: In(patientIds) } })
        : Promise.resolve([] as Patient[]),
      this.providerService.getDoctorsByIds(doctorIds),
    ]);
    const patientMap = new Map(patientRows.map((p) => [p.id, p]));

    return rows.map((r) =>
      toAppointmentResponseWithSummaries(
        r,
        r.patientId ? patientMap.get(r.patientId) : undefined,
        doctorMap.get(r.doctorId),
      ),
    );
  }

  async getById(id: string): Promise<Appointment> {
    const tenantId = this.tenantContext.getTenantId();
    const appt = await this.appointments.findOne({ where: { id, tenantId } });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  async reserve(input: { slotId: string; patientId: string; reasonText?: string }): Promise<Appointment> {
    const tenantId = this.tenantContext.getTenantId();

    const slot = await this.slots.findOne({ where: { id: input.slotId, tenantId } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.status !== SlotStatus.OPEN) {
      throw new ConflictException('Slot is not available');
    }

    const patient = await this.patients.findOne({ where: { id: input.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const service = await this.services.findOne({
      where: { id: slot.serviceTypeId, tenantId },
    });
    if (!service) throw new NotFoundException('Service type not found');

    const won = await this.slotHold.tryHold(slot.id, input.patientId);
    if (!won) throw new ConflictException('Slot is being booked by another user');

    try {
      return await this.dataSource.transaction(async (em) => {
        // Re-check slot under lock to be safe
        const fresh = await em
          .getRepository(Slot)
          .createQueryBuilder('s')
          .setLock('pessimistic_write')
          .where('s.id = :id AND s.tenant_id = :tenantId', { id: slot.id, tenantId })
          .getOne();
        if (!fresh || fresh.status !== SlotStatus.OPEN) {
          throw new ConflictException('Slot is no longer open');
        }
        fresh.status = SlotStatus.HELD;
        fresh.heldUntil = new Date(Date.now() + 10 * 60_000);
        await em.save(fresh);

        const appt = em.getRepository(Appointment).create({
          tenantId,
          slotId: slot.id,
          patientId: input.patientId,
          doctorId: slot.doctorId,
          serviceTypeId: slot.serviceTypeId,
          status: AppointmentStatus.RESERVED,
          reasonText: input.reasonText ?? null,
          startAt: slot.startAt,
          endAt: slot.endAt,
        });
        const saved = await em.save(appt);

        this.eventBus.publish(
          new AppointmentReservedEvent(saved.id, tenantId, saved.patientId, saved.doctorId),
        );
        return saved;
      });
    } catch (e) {
      await this.slotHold.release(slot.id);
      throw e;
    }
  }

  async confirm(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.CONFIRMED, async (em, appt) => {
      const slot = await em.getRepository(Slot).findOne({ where: { id: appt.slotId } });
      if (slot) {
        slot.status = SlotStatus.BOOKED;
        slot.heldUntil = null;
        await em.save(slot);
      }
      this.eventBus.publish(
        new AppointmentConfirmedEvent(appt.id, appt.tenantId, appt.patientId, appt.doctorId),
      );
      await this.slotHold.release(appt.slotId);
    });
  }

  async markAwaitingPayment(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.AWAITING_PAYMENT);
  }

  /**
   * Move an appointment to a different slot. Status is preserved — this is
   * purely a time/slot swap, not a workflow transition. Allowed only while
   * the appointment is still pre-call (RESERVED, AWAITING_PAYMENT, CONFIRMED);
   * once IN_PROGRESS or terminal, rescheduling makes no sense.
   *
   * Atomicity: pessimistic locks on the appointment AND both slots so two
   * concurrent reschedules can't end up both pointing at the same slot
   * (slotId is UNIQUE on appointment, so a race would surface as a DB error
   * — the lock turns it into a clean 409 instead).
   */
  async reschedule(
    id: string,
    newSlotId: string,
    reason?: string,
  ): Promise<Appointment> {
    const ALLOWED_FROM = new Set<AppointmentStatus>([
      AppointmentStatus.RESERVED,
      AppointmentStatus.AWAITING_PAYMENT,
      AppointmentStatus.CONFIRMED,
    ]);

    return this.dataSource.transaction(async (em) => {
      const apptRepo = em.getRepository(Appointment);
      const slotRepo = em.getRepository(Slot);

      const appt = await apptRepo
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id })
        .getOne();
      if (!appt) throw new NotFoundException('Appointment not found');
      if (!ALLOWED_FROM.has(appt.status)) {
        throw new BadRequestException(
          `Cannot reschedule appointment in status ${appt.status}`,
        );
      }

      if (appt.slotId === newSlotId) {
        // No-op reschedule — reject so the caller doesn't confuse "nothing
        // happened" with success.
        throw new BadRequestException('New slot is identical to the current slot');
      }

      const newSlot = await slotRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id AND s.tenant_id = :tenantId', {
          id: newSlotId,
          tenantId: appt.tenantId,
        })
        .getOne();
      if (!newSlot) throw new NotFoundException('New slot not found');

      // slotId is UNIQUE on appointments — verify no *other* appointment is
      // already attached to this slot. (Includes both BOOKED-for-them and
      // soft-deleted-but-still-FK rows.)
      const conflicting = await apptRepo.findOne({
        where: { slotId: newSlot.id },
      });
      if (conflicting && conflicting.id !== appt.id) {
        throw new ConflictException('Target slot is already booked');
      }

      const oldSlotId = appt.slotId;
      const oldStartAt = appt.startAt;
      const oldEndAt = appt.endAt;

      // Free the old slot. We unconditionally flip to OPEN here — for MIS-
      // managed slots this still leaves them harmless because their lifecycle
      // is owned by the next webhook anyway.
      const oldSlot = await slotRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: oldSlotId })
        .getOne();
      if (oldSlot) {
        oldSlot.status = SlotStatus.OPEN;
        oldSlot.heldUntil = null;
        await em.save(oldSlot);
      }

      // Lock down the new slot. BOOKED matches CONFIRMED; for not-yet-confirmed
      // statuses we still mark BOOKED — the MIS path always reschedules into a
      // freshly-minted MIS slot, and there's no native client UI to land in
      // these states with reschedule yet.
      newSlot.status = SlotStatus.BOOKED;
      newSlot.heldUntil = null;
      await em.save(newSlot);

      appt.slotId = newSlot.id;
      appt.startAt = newSlot.startAt;
      appt.endAt = newSlot.endAt;
      const saved = await apptRepo.save(appt);

      this.eventBus.publish(
        new AppointmentRescheduledEvent(
          saved.id,
          saved.tenantId,
          saved.patientId,
          saved.doctorId,
          oldStartAt,
          oldEndAt,
          saved.startAt,
          saved.endAt,
          reason ?? null,
        ),
      );
      return saved;
    });
  }

  async cancel(id: string, byPatient: boolean, reason?: string): Promise<Appointment> {
    const status = byPatient
      ? AppointmentStatus.CANCELLED_BY_PATIENT
      : AppointmentStatus.CANCELLED_BY_PROVIDER;
    return this.transition(id, status, async (em, appt) => {
      appt.cancelledReason = reason ?? null;
      const slot = await em.getRepository(Slot).findOne({ where: { id: appt.slotId } });
      if (slot) {
        slot.status = SlotStatus.OPEN;
        slot.heldUntil = null;
        await em.save(slot);
      }
      this.eventBus.publish(
        new AppointmentCancelledEvent(
          appt.id,
          appt.tenantId,
          appt.patientId,
          appt.doctorId,
          reason ?? null,
        ),
      );
      await this.slotHold.release(appt.slotId);
    });
  }

  async start(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.IN_PROGRESS);
  }

  async complete(id: string): Promise<Appointment> {
    const appt = await this.transition(id, AppointmentStatus.COMPLETED);
    await this.transition(id, AppointmentStatus.DOCUMENTATION_PENDING);
    this.eventBus.publish(new AppointmentCompletedEvent(appt.id, appt.tenantId));
    return this.getById(id);
  }

  async markDocumentationCompleted(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.DOCUMENTATION_COMPLETED);
  }

  async setPaymentId(id: string, paymentId: string): Promise<void> {
    await this.appointments.update({ id }, { paymentId });
  }

  async setConsultationSessionId(id: string, sessionId: string): Promise<void> {
    await this.appointments.update({ id }, { consultationSessionId: sessionId });
  }

  /**
   * State machine transition with optimistic version check.
   */
  private async transition(
    id: string,
    next: AppointmentStatus,
    sideEffects?: (em: import('typeorm').EntityManager, appt: Appointment) => Promise<void>,
  ): Promise<Appointment> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Appointment);
      const appt = await repo
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id })
        .getOne();
      if (!appt) throw new NotFoundException('Appointment not found');
      if (TERMINAL_STATUSES.has(appt.status)) {
        throw new BadRequestException(`Appointment is already in terminal state ${appt.status}`);
      }
      const allowed = ALLOWED_TRANSITIONS[appt.status] ?? [];
      if (!allowed.includes(next)) {
        throw new BadRequestException(`Illegal transition ${appt.status} → ${next}`);
      }
      appt.status = next;
      if (sideEffects) await sideEffects(em, appt);
      return repo.save(appt);
    });
  }
}
