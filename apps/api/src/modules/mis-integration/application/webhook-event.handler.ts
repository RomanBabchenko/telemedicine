import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import {
  AppointmentStatus,
  Role,
  ServiceMode,
  SlotStatus,
  VerificationStatus,
} from '@telemed/shared-types';
import { ExternalEntityType, ExternalIdentity } from '../domain/entities/external-identity.entity';
import { OnlineAppointmentPayload } from '../domain/ports/mis-connector';
import { SubmitAppointmentBodyDto } from '../api/dto/submit-appointment.body.dto';
import { Doctor } from '../../provider/domain/entities/doctor.entity';
import { DoctorTenantProfile } from '../../provider/domain/entities/doctor-tenant-profile.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { Slot } from '../../booking/domain/entities/slot.entity';
import { ServiceType } from '../../booking/domain/entities/service-type.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { User } from '../../identity/domain/entities/user.entity';
import { UserTenantMembership } from '../../identity/domain/entities/user-tenant-membership.entity';
import { ConsultationService } from '../../consultation/application/consultation.service';
import { ConsultationInviteService } from './consultation-invite.service';
import { PasswordService } from '../../identity/application/password.service';
import { AppConfig } from '../../../config/env.config';

const PLACEHOLDER_USER_ID = '00000000-0000-4000-8000-000000000000';

// Re-POSTing an externalAppointmentId that maps to an appointment in one of
// these states means the MIS is trying to reuse a dead external id. Refuse
// rather than silently issue fresh invites for an appointment the patient
// can no longer join — DocDream must generate a new externalAppointmentId.
const TERMINAL_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DOCUMENTATION_COMPLETED,
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.CANCELLED_BY_PROVIDER,
  AppointmentStatus.NO_SHOW_PATIENT,
  AppointmentStatus.NO_SHOW_PROVIDER,
  AppointmentStatus.REFUNDED,
]);

@Injectable()
export class WebhookEventHandler {
  private readonly logger = new Logger(WebhookEventHandler.name);

  constructor(
    @InjectRepository(ExternalIdentity)
    private readonly externalIds: Repository<ExternalIdentity>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Slot) private readonly slots: Repository<Slot>,
    @InjectRepository(ServiceType) private readonly services: Repository<ServiceType>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserTenantMembership)
    private readonly memberships: Repository<UserTenantMembership>,
    @InjectRepository(DoctorTenantProfile)
    private readonly doctorProfiles: Repository<DoctorTenantProfile>,
    private readonly consultations: ConsultationService,
    private readonly invites: ConsultationInviteService,
    private readonly passwords: PasswordService,
    private readonly dataSource: DataSource,
    private readonly config: AppConfig,
  ) {}

  async handleOnlineAppointment(
    tenantId: string,
    connectorId: string,
    payload: OnlineAppointmentPayload,
  ) {
    // Declarative validation. The controller accepts `@Body() body: unknown` so
    // ValidationPipe doesn't run upstream — validate here, after the connector
    // has normalized the payload to OnlineAppointmentPayload.
    const dto = plainToInstance(SubmitAppointmentBodyDto, payload);
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid MIS appointment payload',
        details: errors.map((e) => ({ property: e.property, constraints: e.constraints })),
      });
    }

    // Idempotency: if this external appointment was already processed, reissue
    // invite links instead of creating a duplicate.
    const existingApptId = await this.resolveExternalId(
      tenantId,
      connectorId,
      'APPOINTMENT',
      payload.externalAppointmentId,
    );
    if (existingApptId) {
      return this.reissueInvites(tenantId, existingApptId);
    }

    const isAnonymous = payload.isAnonymousPatient === true;
    if (
      isAnonymous &&
      (payload.patientFirstName ||
        payload.patientLastName ||
        payload.patientEmail ||
        payload.patientPhone ||
        payload.patientExternalId)
    ) {
      // Anonymous flag wins — the MIS MUST NOT send PII in this mode. Log
      // loudly so ops notice if DocDream leaks fields during migration.
      this.logger.warn(
        `Anonymous appointment payload contains patient* fields; ignored (connector=${connectorId})`,
      );
    }

    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);

    // 1. Find-or-create doctor (same path for named and anonymous)
    const { doctorId, doctorUserId } = await this.findOrCreateDoctor(
      tenantId,
      connectorId,
      payload,
    );

    // 2. Find-or-create patient — skipped entirely in anonymous mode.
    let patientId: string | null = null;
    let patientUserId: string | null = null;
    if (!isAnonymous) {
      const resolved = await this.findOrCreatePatient(tenantId, connectorId, payload);
      patientId = resolved.patientId;
      patientUserId = resolved.patientUserId;
    }

    // 3. Find-or-create service type
    const serviceTypeId = await this.findOrCreateServiceType(
      tenantId,
      connectorId,
      doctorId,
      payload,
    );

    // 4. Find-or-create slot + appointment in a transaction
    const appointment = await this.dataSource.transaction(async (em) => {
      const slotRepo = em.getRepository(Slot);
      let slot = await slotRepo.findOne({
        where: { tenantId, doctorId, startAt },
      });
      if (!slot) {
        slot = slotRepo.create({
          tenantId,
          doctorId,
          serviceTypeId,
          startAt,
          endAt,
          status: SlotStatus.BOOKED,
          sourceIsMis: true,
          externalSlotId: payload.externalAppointmentId,
        });
        slot = await slotRepo.save(slot);
      }

      // Check if appointment already exists for this slot
      const apptRepo = em.getRepository(Appointment);
      const existingAppt = await apptRepo.findOne({
        where: { slotId: slot.id },
      });
      if (existingAppt) return existingAppt;

      // Prepaid + unpaid → hold the appointment until the clinic confirms
      // payment via PATCH /integrations/:tenantId/appointments/:id/payment-status.
      // Postpaid or prepaid+paid → confirmed, patient can join immediately.
      const initialStatus =
        payload.paymentType === 'prepaid' && payload.paymentStatus !== 'paid'
          ? AppointmentStatus.AWAITING_PAYMENT
          : AppointmentStatus.CONFIRMED;

      const appt = apptRepo.create({
        tenantId,
        slotId: slot.id,
        patientId,
        isAnonymousPatient: isAnonymous,
        doctorId,
        serviceTypeId,
        status: initialStatus,
        startAt,
        endAt,
        misPaymentType: payload.paymentType,
        misPaymentStatus: payload.paymentStatus,
      });
      return apptRepo.save(appt);
    });

    // 5. Create consultation session synchronously
    const session = await this.consultations.ensureForAppointment(appointment.id);

    // 6. Map external appointment ID
    await this.externalIds.save(
      this.externalIds.create({
        tenantId,
        entityType: 'APPOINTMENT',
        internalId: appointment.id,
        externalSystem: connectorId,
        externalId: payload.externalAppointmentId,
      }),
    );

    // 7. Generate invite links (TTL = appointment.endAt + grace)
    // Patient invite gets userId=null in anonymous mode; the consume path
    // recognises that and issues a scope='invite-anon' JWT.
    const [patientToken, doctorToken] = await Promise.all([
      this.invites.issue({
        tenantId,
        appointmentId: appointment.id,
        consultationSessionId: session.id,
        userId: patientUserId,
        role: 'PATIENT',
        appointmentEndAt: endAt,
      }),
      this.invites.issue({
        tenantId,
        appointmentId: appointment.id,
        consultationSessionId: session.id,
        userId: doctorUserId,
        role: 'DOCTOR',
        appointmentEndAt: endAt,
      }),
    ]);

    const patientInviteUrl = `${this.config.patientAppUrl}/invite?token=${patientToken}`;
    const doctorInviteUrl = `${this.config.doctorAppUrl}/invite?token=${doctorToken}`;

    this.logger.log(
      `Online appointment created: ${appointment.id}, session: ${session.id}`,
    );

    return {
      received: true,
      appointmentId: appointment.id,
      consultationSessionId: session.id,
      patientInviteUrl,
      doctorInviteUrl,
    };
  }

  // ─── Idempotent reissue ────────────────────────────────────────────────────

  private async reissueInvites(tenantId: string, appointmentId: string) {
    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, tenantId },
    });
    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    // Don't quietly hand out fresh invite URLs for a cancelled/completed
    // appointment — that's the path that made debugging confusing (the
    // response looked successful but the patient hit a 403 on join). Tell
    // DocDream explicitly so they generate a new externalAppointmentId.
    if (TERMINAL_APPOINTMENT_STATUSES.has(appointment.status)) {
      throw new ConflictException(
        `Appointment is in terminal state ${appointment.status}; ` +
          'use a new externalAppointmentId to create a fresh appointment.',
      );
    }

    const session = await this.consultations.ensureForAppointment(appointmentId);

    const doctor = await this.doctors.findOne({
      where: { id: appointment.doctorId },
    });
    if (!doctor?.userId) {
      throw new Error('Doctor user not found');
    }

    // Anonymous appointments have no Patient row — patient invite userId stays
    // null, and the consume endpoint issues a scope='invite-anon' JWT.
    let patientUserId: string | null = null;
    if (!appointment.isAnonymousPatient) {
      if (!appointment.patientId) {
        throw new Error(
          `Appointment ${appointmentId} is not anonymous but has no patient_id`,
        );
      }
      const patient = await this.patients.findOne({
        where: { id: appointment.patientId },
      });
      if (!patient?.userId) {
        throw new Error('Patient user not found');
      }
      patientUserId = patient.userId;
    }

    const [patientToken, doctorToken] = await Promise.all([
      this.invites.issue({
        tenantId,
        appointmentId,
        consultationSessionId: session.id,
        userId: patientUserId,
        role: 'PATIENT',
        appointmentEndAt: appointment.endAt,
      }),
      this.invites.issue({
        tenantId,
        appointmentId,
        consultationSessionId: session.id,
        userId: doctor.userId,
        role: 'DOCTOR',
        appointmentEndAt: appointment.endAt,
      }),
    ]);

    return {
      received: true,
      appointmentId,
      consultationSessionId: session.id,
      patientInviteUrl: `${this.config.patientAppUrl}/invite?token=${patientToken}`,
      doctorInviteUrl: `${this.config.doctorAppUrl}/invite?token=${doctorToken}`,
    };
  }

  // ─── Doctor find-or-create ────────────────────────────────────────────────

  private async findOrCreateDoctor(
    tenantId: string,
    connectorId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<{ doctorId: string; doctorUserId: string }> {
    const existingId = await this.resolveExternalId(
      tenantId,
      connectorId,
      'DOCTOR',
      payload.doctorExternalId,
    );

    if (existingId) {
      const doctor = await this.doctors.findOne({ where: { id: existingId } });
      if (doctor) {
        // Update doctor data from the webhook payload
        doctor.firstName = payload.doctorFirstName;
        doctor.lastName = payload.doctorLastName;
        doctor.specializations = [payload.doctorSpecialization];
        await this.doctors.save(doctor);

        const userId = await this.ensureDoctorHasRealUser(
          doctor,
          tenantId,
          payload,
        );
        await this.ensureDoctorTenantProfile(tenantId, doctor);
        return { doctorId: doctor.id, doctorUserId: userId };
      }
    }

    // Create from scratch
    return this.createDoctorFromPayload(tenantId, connectorId, payload);
  }

  private async ensureDoctorHasRealUser(
    doctor: Doctor,
    tenantId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<string> {
    if (doctor.userId !== PLACEHOLDER_USER_ID) {
      await this.ensureMembership(doctor.userId, tenantId, Role.DOCTOR);
      return doctor.userId;
    }

    // Replace placeholder with a real user
    const email = `doctor.${payload.doctorExternalId}@mis-import.local`;
    const user = await this.findOrCreateUser({
      email,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
    });

    doctor.userId = user.id;
    await this.doctors.save(doctor);

    await this.ensureMembership(user.id, tenantId, Role.DOCTOR);
    return user.id;
  }

  private async createDoctorFromPayload(
    tenantId: string,
    connectorId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<{ doctorId: string; doctorUserId: string }> {
    const email = `doctor.${payload.doctorExternalId}@mis-import.local`;
    const user = await this.findOrCreateUser({
      email,
      firstName: payload.doctorFirstName,
      lastName: payload.doctorLastName,
    });

    // Reuse existing doctor if user already has one
    let doctor = await this.doctors.findOne({ where: { userId: user.id } });
    if (doctor) {
      doctor.firstName = payload.doctorFirstName;
      doctor.lastName = payload.doctorLastName;
      doctor.specializations = [payload.doctorSpecialization];
      await this.doctors.save(doctor);
    } else {
      doctor = this.doctors.create({
        userId: user.id,
        firstName: payload.doctorFirstName,
        lastName: payload.doctorLastName,
        specializations: [payload.doctorSpecialization],
        languages: ['uk'],
        yearsOfExperience: 0,
        basePrice: '0',
        defaultDurationMin: 30,
        verificationStatus: VerificationStatus.VERIFIED,
      });
      await this.doctors.save(doctor);
    }

    const mapped = await this.resolveExternalId(
      tenantId, connectorId, 'DOCTOR', payload.doctorExternalId,
    );
    if (!mapped) {
      await this.externalIds.save(
        this.externalIds.create({
          tenantId,
          entityType: 'DOCTOR',
          internalId: doctor.id,
          externalSystem: connectorId,
          externalId: payload.doctorExternalId,
        }),
      );
    }

    await this.ensureMembership(user.id, tenantId, Role.DOCTOR);
    await this.ensureDoctorTenantProfile(tenantId, doctor);

    return { doctorId: doctor.id, doctorUserId: user.id };
  }

  private async ensureDoctorTenantProfile(
    tenantId: string,
    doctor: Doctor,
  ): Promise<void> {
    const existing = await this.doctorProfiles.findOne({
      where: { tenantId, doctorId: doctor.id },
    });
    if (existing) return;
    await this.doctorProfiles.save(
      this.doctorProfiles.create({
        tenantId,
        doctorId: doctor.id,
        displayName: `${doctor.firstName} ${doctor.lastName}`,
        price: doctor.basePrice,
        isPublished: true,
        slotSourceIsMis: true,
      }),
    );
  }

  // ─── Patient find-or-create ───────────────────────────────────────────────

  private async findOrCreatePatient(
    tenantId: string,
    connectorId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<{ patientId: string; patientUserId: string }> {
    // Named-mode payloads always carry patientExternalId (validated at the
    // entry of handleOnlineAppointment). It is the single dedup key.
    const patientExternalId = payload.patientExternalId as string;

    const existingId = await this.resolveExternalId(
      tenantId,
      connectorId,
      'PATIENT',
      patientExternalId,
    );
    if (existingId) {
      const patient = await this.patients.findOne({ where: { id: existingId } });
      if (patient && patient.userId) {
        await this.ensureMembership(patient.userId, tenantId, Role.PATIENT);
        return { patientId: patient.id, patientUserId: patient.userId };
      }
      if (patient) {
        const userId = await this.createUserForPatient(patient, tenantId, payload);
        return { patientId: patient.id, patientUserId: userId };
      }
    }

    return this.createPatientFromPayload(tenantId, connectorId, payload);
  }

  private async createUserForPatient(
    patient: Patient,
    tenantId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<string> {
    // Named path only — anonymous payloads never reach createUserForPatient.
    const email =
      payload.patientEmail ??
      `patient.${patient.id.slice(0, 8)}@mis-import.local`;
    const user = await this.findOrCreateUser({
      email,
      phone: payload.patientPhone,
      firstName: patient.firstName,
      lastName: patient.lastName,
    });

    patient.userId = user.id;
    patient.email = patient.email ?? user.email;
    patient.phone = patient.phone ?? user.phone;
    await this.patients.save(patient);

    await this.ensureMembership(user.id, tenantId, Role.PATIENT);
    return user.id;
  }

  private async createPatientFromPayload(
    tenantId: string,
    connectorId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<{ patientId: string; patientUserId: string }> {
    // Anonymous payloads short-circuit before reaching this helper. Named-mode
    // payloads are guaranteed by validation to carry patientExternalId,
    // patientFirstName, patientLastName, and at least one of email/phone.
    const firstName = payload.patientFirstName as string;
    const lastName = payload.patientLastName as string;
    const patientExternalId = payload.patientExternalId as string;
    // Deterministic synthetic email (per externalId) when MIS sends only phone.
    // Replaces the old `Date.now()`-based fallback that produced a fresh
    // synthetic email — and a duplicate User/Patient — on every webhook.
    const email =
      payload.patientEmail ?? `patient.${patientExternalId}@mis-import.local`;
    const user = await this.findOrCreateUser({
      email,
      phone: payload.patientPhone,
      firstName,
      lastName,
    });

    let patient = await this.patients.findOne({ where: { userId: user.id } });
    if (!patient) {
      patient = this.patients.create({
        userId: user.id,
        firstName,
        lastName,
        email: user.email,
        phone: user.phone,
        preferredLocale: 'uk',
      });
      await this.patients.save(patient);
    }

    const mapped = await this.resolveExternalId(
      tenantId, connectorId, 'PATIENT', patientExternalId,
    );
    if (!mapped) {
      await this.externalIds.save(
        this.externalIds.create({
          tenantId,
          entityType: 'PATIENT',
          internalId: patient.id,
          externalSystem: connectorId,
          externalId: patientExternalId,
        }),
      );
    }

    await this.ensureMembership(user.id, tenantId, Role.PATIENT);
    return { patientId: patient.id, patientUserId: user.id };
  }

  // ─── ServiceType find-or-create ───────────────────────────────────────────

  private async findOrCreateServiceType(
    tenantId: string,
    connectorId: string,
    doctorId: string,
    payload: OnlineAppointmentPayload,
  ): Promise<string> {
    // Try to find existing VIDEO service type for this doctor in this tenant
    const existing = await this.services.findOne({
      where: { tenantId, doctorId, mode: ServiceMode.VIDEO },
    });
    if (existing) return existing.id;

    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);
    const durationMin = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);

    const serviceType = this.services.create({
      tenantId,
      doctorId,
      code: 'MIS_ONLINE',
      name: 'Онлайн-консультація',
      durationMin: durationMin > 0 ? durationMin : 30,
      price: '0',
      mode: ServiceMode.VIDEO,
    });
    const saved = await this.services.save(serviceType);
    return saved.id;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findOrCreateUser(input: {
    email: string;
    phone?: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    const existing = await this.users.findOne({ where: { email: input.email } });
    if (existing) return existing;

    const passwordHash = await this.passwords.hash(`mis-import-${Date.now()}`);
    const user = this.users.create({
      email: input.email,
      phone: input.phone ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    return this.users.save(user);
  }

  private async resolveExternalId(
    tenantId: string,
    externalSystem: string,
    entityType: ExternalEntityType,
    externalId: string,
  ): Promise<string | null> {
    const row = await this.externalIds.findOne({
      where: { tenantId, externalSystem, entityType, externalId },
    });
    return row?.internalId ?? null;
  }

  private async ensureMembership(
    userId: string,
    tenantId: string,
    role: Role,
  ): Promise<void> {
    const existing = await this.memberships.findOne({
      where: { userId, tenantId, role },
    });
    if (existing) return;
    await this.memberships.save(
      this.memberships.create({ userId, tenantId, role, isDefault: true }),
    );
  }
}
