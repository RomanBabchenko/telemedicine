import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Role, ServiceMode, SlotStatus, VerificationStatus } from '@telemed/shared-types';
import { Doctor } from '../domain/entities/doctor.entity';
import { DoctorTenantProfile } from '../domain/entities/doctor-tenant-profile.entity';
import { AvailabilityRule } from '../../booking/domain/entities/availability-rule.entity';
import { ServiceType } from '../../booking/domain/entities/service-type.entity';
import { Slot } from '../../booking/domain/entities/slot.entity';
import { User } from '../../identity/domain/entities/user.entity';
import { UserTenantMembership } from '../../identity/domain/entities/user-tenant-membership.entity';
import { PasswordService } from '../../identity/application/password.service';
import { UserService } from '../../identity/application/user.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface DoctorSearchInput {
  specialization?: string;
  language?: string;
  page?: number;
  pageSize?: number;
  /**
   * Include doctors whose verificationStatus is not VERIFIED.
   * Default false → public listings only show verified doctors.
   * Admin endpoints pass true so the clinic can see freshly created
   * doctors that still need verification.
   */
  includeUnverified?: boolean;
  /**
   * Include doctors whose tenant profile has isPublished=false (i.e.
   * deactivated). Default false — public listings only show active
   * doctors. Admin endpoints pass true so the clinic can re-activate them.
   */
  includeUnpublished?: boolean;
}

export interface CreateDoctorInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specializations: string[];
  languages?: string[];
  licenseNumber?: string;
  yearsOfExperience?: number;
  bio?: string;
  photoUrl?: string;
  basePrice?: number;
  defaultDurationMin?: number;
}

export interface UpdateDoctorInput {
  firstName?: string;
  lastName?: string;
  bio?: string;
  photoUrl?: string;
  basePrice?: number;
  defaultDurationMin?: number;
  specializations?: string[];
  subspecializations?: string[];
  languages?: string[];
  licenseNumber?: string;
  yearsOfExperience?: number;
}

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(DoctorTenantProfile)
    private readonly profiles: Repository<DoctorTenantProfile>,
    @InjectRepository(AvailabilityRule)
    private readonly rules: Repository<AvailabilityRule>,
    private readonly tenantContext: TenantContextService,
    private readonly passwords: PasswordService,
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  async search(input: DoctorSearchInput) {
    const tenantId = this.tenantContext.getTenantId();
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);
    const includeUnverified = input.includeUnverified ?? false;

    // Step 1: narrow down the doctor IDs by attributes that live on the
    // Doctor entity (specializations, languages, verificationStatus).
    // We always run this when verification filtering is on, even without
    // other filters, so the tenant-profile pagination gets a hard ID list.
    // We use a raw subset query — TypeORM 0.3.x has known regressions where
    // joined QueryBuilder + take/skip generate broken pagination subqueries
    // (see node_modules/typeorm/.../SelectQueryBuilder createOrderByCombinedWithSelectExpression).
    let doctorIdFilter: string[] | null = null;
    const needsDoctorFilter =
      Boolean(input.specialization) || Boolean(input.language) || !includeUnverified;
    if (needsDoctorFilter) {
      const docQb = this.doctors
        .createQueryBuilder('d')
        .select('d.id', 'id')
        .where('d.deleted_at IS NULL');
      if (input.specialization) {
        docQb.andWhere(':spec = ANY(d.specializations)', { spec: input.specialization });
      }
      if (input.language) {
        docQb.andWhere(':lang = ANY(d.languages)', { lang: input.language });
      }
      if (!includeUnverified) {
        docQb.andWhere('d.verification_status = :vs', {
          vs: VerificationStatus.VERIFIED,
        });
      }
      const rows = await docQb.getRawMany<{ id: string }>();
      doctorIdFilter = rows.map((r) => r.id);
      if (doctorIdFilter.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    // Step 2: paginate over profiles in this tenant. Plain findAndCount — no joins,
    // no broken subqueries.
    const includeUnpublished = input.includeUnpublished ?? false;
    const where: Record<string, unknown> = {
      tenantId,
    };
    if (!includeUnpublished) {
      where.isPublished = true;
    }
    if (doctorIdFilter) {
      where.doctorId = In(doctorIdFilter);
    }

    const [profiles, total] = await this.profiles.findAndCount({
      where,
      order: { createdAt: 'ASC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });

    if (profiles.length === 0) {
      return { items: [], total, page, pageSize };
    }

    // Step 3: load doctor cards for the page.
    const doctors = await this.doctors.find({
      where: { id: In(profiles.map((p) => p.doctorId)) },
    });
    const doctorMap = new Map(doctors.map((d) => [d.id, d]));

    const items = profiles
      .map((p) => {
        const doctor = doctorMap.get(p.doctorId);
        if (!doctor) return null;
        return this.toDto(p, doctor);
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        const byLast = a.lastName.localeCompare(b.lastName);
        return byLast !== 0 ? byLast : a.firstName.localeCompare(b.firstName);
      });

    return { items, total, page, pageSize };
  }

  async getById(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const profile = await this.profiles.findOne({
      where: { tenantId, doctorId: id },
    });
    if (!profile) throw new NotFoundException('Doctor not found in this tenant');
    const doctor = await this.doctors.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.toDto(profile, doctor);
  }

  async create(input: CreateDoctorInput) {
    const tenantId = this.tenantContext.getTenantId();
    const existing = await this.userService.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.passwords.hash(input.password);
    const basePriceStr = String(input.basePrice ?? 0);
    const durationMin = input.defaultDurationMin ?? 30;

    const { doctor, profile } = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const doctorRepo = manager.getRepository(Doctor);
      const profileRepo = manager.getRepository(DoctorTenantProfile);
      const membershipRepo = manager.getRepository(UserTenantMembership);
      const serviceTypeRepo = manager.getRepository(ServiceType);
      const ruleRepo = manager.getRepository(AvailabilityRule);
      const slotRepo = manager.getRepository(Slot);

      const user = userRepo.create({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        status: 'ACTIVE',
        mfaEnabled: false,
      });
      await userRepo.save(user);

      const doctor = doctorRepo.create({
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        specializations: input.specializations,
        subspecializations: [],
        languages: input.languages ?? [],
        licenseNumber: input.licenseNumber ?? null,
        yearsOfExperience: input.yearsOfExperience ?? 0,
        bio: input.bio ?? null,
        photoUrl: input.photoUrl ?? null,
        verificationStatus: VerificationStatus.PENDING,
        basePrice: basePriceStr,
        defaultDurationMin: durationMin,
      });
      await doctorRepo.save(doctor);

      const profile = profileRepo.create({
        tenantId,
        doctorId: doctor.id,
        displayName: `${input.firstName} ${input.lastName}`,
        price: basePriceStr,
        isPublished: true,
        slotSourceIsMis: false,
      });
      await profileRepo.save(profile);

      await membershipRepo.save(
        membershipRepo.create({
          userId: user.id,
          tenantId,
          role: Role.DOCTOR,
          isDefault: true,
        }),
      );

      // ---- Default ServiceType (one per doctor in this tenant) ----
      const serviceType = serviceTypeRepo.create({
        tenantId,
        doctorId: doctor.id,
        code: 'INITIAL',
        name: 'Первинна онлайн-консультація',
        durationMin,
        price: basePriceStr,
        mode: ServiceMode.VIDEO,
        isFollowUp: false,
      });
      await serviceTypeRepo.save(serviceType);

      // ---- Availability rules: Mon–Fri 09:00–17:00 ----
      const rules = [1, 2, 3, 4, 5].map((weekday) =>
        ruleRepo.create({
          tenantId,
          doctorId: doctor.id,
          weekday,
          startTime: '09:00',
          endTime: '17:00',
          bufferMin: 0,
          serviceTypeId: serviceType.id,
          validFrom: null,
          validUntil: null,
        }),
      );
      await ruleRepo.save(rules);

      // ---- Slots: next 14 days, 10:00–13:00 UTC every 30 min (= 6 slots/day) ----
      // Same shape as the demo seed so the new doctor immediately looks
      // bookable. Long-term this should derive from availability_rules,
      // but for now it matches existing behaviour.
      const slots = this.buildDemoSlots(slotRepo, tenantId, doctor.id, serviceType.id);
      if (slots.length) {
        await slotRepo.save(slots);
      }

      return { doctor, profile };
    });

    return this.toDto(profile, doctor);
  }

  /**
   * Build a 14-day demo slot grid (10:00–13:00 UTC, 30-min intervals,
   * 6 slots per day). Slots whose `startAt` is in the past are skipped —
   * otherwise the regenerate path would crash on the per-tenant unique
   * constraint when the same `(tenant, doctor, start_at)` is recreated.
   */
  private buildDemoSlots(
    slotRepo: Repository<Slot>,
    tenantId: string,
    doctorId: string,
    serviceTypeId: string,
  ): Slot[] {
    const slots: Slot[] = [];
    const now = new Date();
    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() + dayOffset);
      day.setUTCHours(10, 0, 0, 0);
      for (let i = 0; i < 6; i += 1) {
        const start = new Date(day.getTime() + i * 30 * 60_000);
        if (start.getTime() <= now.getTime()) continue;
        const end = new Date(start.getTime() + 30 * 60_000);
        slots.push(
          slotRepo.create({
            tenantId,
            doctorId,
            serviceTypeId,
            startAt: start,
            endAt: end,
            status: SlotStatus.OPEN,
            sourceIsMis: false,
          }),
        );
      }
    }
    return slots;
  }

  /**
   * Regenerate the next 14 days of OPEN slots for an existing doctor.
   * Useful for doctors created before slot generation was wired into
   * `create()`, or when the demo data goes stale.
   *
   * Picks up the doctor's tenant from request context, requires a
   * pre-existing ServiceType in that tenant (we don't auto-create one
   * here — `create()` handles that path). Old OPEN+future slots are
   * deleted first to avoid duplicates against the per-tenant unique
   * constraint.
   */
  async regenerateSlots(doctorId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const doctor = await this.doctors.findOne({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    return this.dataSource.transaction(async (manager) => {
      const serviceTypeRepo = manager.getRepository(ServiceType);
      const slotRepo = manager.getRepository(Slot);

      let serviceType = await serviceTypeRepo.findOne({
        where: { tenantId, doctorId },
      });
      if (!serviceType) {
        serviceType = serviceTypeRepo.create({
          tenantId,
          doctorId,
          code: 'INITIAL',
          name: 'Первинна онлайн-консультація',
          durationMin: doctor.defaultDurationMin,
          price: doctor.basePrice,
          mode: ServiceMode.VIDEO,
          isFollowUp: false,
        });
        await serviceTypeRepo.save(serviceType);
      }

      // Drop only future OPEN slots — keep history (HELD/BOOKED) intact.
      await slotRepo
        .createQueryBuilder()
        .delete()
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('doctor_id = :doctorId', { doctorId })
        .andWhere('status = :status', { status: SlotStatus.OPEN })
        .andWhere('source_is_mis = false')
        .andWhere('start_at > now()')
        .execute();

      const slots = this.buildDemoSlots(slotRepo, tenantId, doctorId, serviceType.id);
      if (slots.length) {
        await slotRepo.save(slots);
      }

      return { ok: true as const, generated: slots.length };
    });
  }

  async update(id: string, input: UpdateDoctorInput) {
    const tenantId = this.tenantContext.getTenantId();
    const doctor = await this.doctors.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    if (input.firstName !== undefined) doctor.firstName = input.firstName;
    if (input.lastName !== undefined) doctor.lastName = input.lastName;
    if (input.bio !== undefined) doctor.bio = input.bio;
    if (input.photoUrl !== undefined) doctor.photoUrl = input.photoUrl;
    if (input.licenseNumber !== undefined) doctor.licenseNumber = input.licenseNumber;
    if (input.yearsOfExperience !== undefined) {
      doctor.yearsOfExperience = input.yearsOfExperience;
    }
    if (input.basePrice !== undefined) doctor.basePrice = String(input.basePrice);
    if (input.defaultDurationMin !== undefined) {
      doctor.defaultDurationMin = input.defaultDurationMin;
    }
    if (input.specializations) doctor.specializations = input.specializations;
    if (input.subspecializations) doctor.subspecializations = input.subspecializations;
    if (input.languages) doctor.languages = input.languages;
    await this.doctors.save(doctor);

    if (
      input.basePrice !== undefined ||
      input.firstName !== undefined ||
      input.lastName !== undefined
    ) {
      const profile = await this.profiles.findOne({
        where: { doctorId: id, tenantId },
      });
      if (profile) {
        if (input.basePrice !== undefined) profile.price = String(input.basePrice);
        if (input.firstName !== undefined || input.lastName !== undefined) {
          profile.displayName = `${doctor.firstName} ${doctor.lastName}`;
        }
        await this.profiles.save(profile);
      }
    }

    return this.getById(id);
  }

  /**
   * Deactivate the doctor in the current tenant. Sets isPublished=false on
   * DoctorTenantProfile so the doctor disappears from public listings, but
   * keeps the User row intact — the same email can't be re-registered, the
   * doctor history stays, and `activate()` brings them back.
   *
   * Method is named `remove` for backwards compatibility with the existing
   * DELETE /doctors/:id route.
   */
  async remove(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const doctor = await this.doctors.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    await this.profiles.update(
      { doctorId: id, tenantId },
      { isPublished: false },
    );
    return { ok: true as const };
  }

  async activate(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const doctor = await this.doctors.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    await this.profiles.update(
      { doctorId: id, tenantId },
      { isPublished: true },
    );
    return { ok: true as const };
  }

  async verify(id: string) {
    const doctor = await this.doctors.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    doctor.verificationStatus = VerificationStatus.VERIFIED;
    await this.doctors.save(doctor);
    return { ok: true as const };
  }

  async listAvailabilityRules(doctorId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const rules = await this.rules.find({
      where: { doctorId, tenantId },
      order: { weekday: 'ASC', startTime: 'ASC' },
    });
    return rules.map((r) => ({
      id: r.id,
      doctorId: r.doctorId,
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      bufferMin: r.bufferMin,
      serviceTypeId: r.serviceTypeId,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
    }));
  }

  async createAvailabilityRule(
    doctorId: string,
    input: {
      weekday: number;
      startTime: string;
      endTime: string;
      bufferMin?: number;
      serviceTypeId?: string;
      validFrom?: string;
      validUntil?: string;
    },
  ) {
    const tenantId = this.tenantContext.getTenantId();
    const rule = this.rules.create({
      tenantId,
      doctorId,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      bufferMin: input.bufferMin ?? 0,
      serviceTypeId: input.serviceTypeId ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
    });
    await this.rules.save(rule);
    return rule;
  }

  async deleteAvailabilityRule(doctorId: string, ruleId: string) {
    const tenantId = this.tenantContext.getTenantId();
    await this.rules.delete({ id: ruleId, doctorId, tenantId });
    return { ok: true as const };
  }

  async getDoctorByUserId(userId: string) {
    return this.doctors.findOne({ where: { userId } });
  }

  async getDoctorsByIds(ids: string[]): Promise<Map<string, Doctor>> {
    if (!ids.length) return new Map();
    const doctors = await this.doctors.find({ where: { id: In(ids) } });
    return new Map(doctors.map((d) => [d.id, d]));
  }

  private toDto(profile: DoctorTenantProfile, doctor: Doctor) {
    const d = doctor;
    return {
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      specializations: d.specializations,
      subspecializations: d.subspecializations,
      licenseNumber: d.licenseNumber,
      yearsOfExperience: d.yearsOfExperience,
      languages: d.languages,
      bio: d.bio,
      photoUrl: d.photoUrl,
      verificationStatus: d.verificationStatus,
      rating: d.rating ? Number(d.rating) : null,
      basePrice: Number(profile.price),
      defaultDurationMin: d.defaultDurationMin,
      isPublished: profile.isPublished,
    };
  }
}
