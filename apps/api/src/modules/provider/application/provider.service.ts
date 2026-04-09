import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VerificationStatus } from '@telemed/shared-types';
import { Doctor } from '../domain/entities/doctor.entity';
import { DoctorTenantProfile } from '../domain/entities/doctor-tenant-profile.entity';
import { AvailabilityRule } from '../../booking/domain/entities/availability-rule.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface DoctorSearchInput {
  specialization?: string;
  language?: string;
  page?: number;
  pageSize?: number;
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
  ) {}

  async search(input: DoctorSearchInput) {
    const tenantId = this.tenantContext.getTenantId();
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);

    // Step 1: if specialization/language filter is set, narrow down the doctor IDs
    // first. We use a raw subset query — TypeORM 0.3.x has known regressions where
    // joined QueryBuilder + take/skip generate broken pagination subqueries
    // (see node_modules/typeorm/.../SelectQueryBuilder createOrderByCombinedWithSelectExpression).
    let doctorIdFilter: string[] | null = null;
    if (input.specialization || input.language) {
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
      const rows = await docQb.getRawMany<{ id: string }>();
      doctorIdFilter = rows.map((r) => r.id);
      if (doctorIdFilter.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    // Step 2: paginate over profiles in this tenant. Plain findAndCount — no joins,
    // no broken subqueries.
    const where: Record<string, unknown> = {
      tenantId,
      isPublished: true,
    };
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

  async update(
    id: string,
    input: {
      bio?: string;
      photoUrl?: string;
      basePrice?: number;
      defaultDurationMin?: number;
      specializations?: string[];
      languages?: string[];
    },
  ) {
    const doctor = await this.doctors.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (input.bio !== undefined) doctor.bio = input.bio;
    if (input.photoUrl !== undefined) doctor.photoUrl = input.photoUrl;
    if (input.basePrice !== undefined) doctor.basePrice = String(input.basePrice);
    if (input.defaultDurationMin !== undefined) doctor.defaultDurationMin = input.defaultDurationMin;
    if (input.specializations) doctor.specializations = input.specializations;
    if (input.languages) doctor.languages = input.languages;
    await this.doctors.save(doctor);
    return this.getById(id);
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
    };
  }
}
