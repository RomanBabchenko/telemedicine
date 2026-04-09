import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../domain/entities/tenant.entity';
import { RevenueShareRule } from '../domain/entities/revenue-share-rule.entity';

export interface UpdateTenantInput {
  brandName?: string;
  primaryColor?: string;
  logoUrl?: string | null;
  locale?: string;
  features?: Record<string, boolean>;
  audioPolicy?: { enabled?: boolean; retentionDays?: number; consentRequired?: boolean };
}

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant) private readonly repo: Repository<Tenant>,
    @InjectRepository(RevenueShareRule)
    private readonly revShareRepo: Repository<RevenueShareRule>,
  ) {}

  findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getOrThrow(id: string): Promise<Tenant> {
    const t = await this.findById(id);
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }

  findBySubdomain(subdomain: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { subdomain } });
  }

  list(): Promise<Tenant[]> {
    return this.repo.find({ order: { brandName: 'ASC' } });
  }

  async create(input: {
    slug: string;
    subdomain: string;
    brandName: string;
    primaryColor?: string;
    locale?: string;
    currency?: string;
    billingPlanId?: string | null;
  }): Promise<Tenant> {
    const tenant = this.repo.create({
      slug: input.slug,
      subdomain: input.subdomain,
      brandName: input.brandName,
      primaryColor: input.primaryColor ?? '#1f7ae0',
      locale: input.locale ?? 'uk',
      currency: input.currency ?? 'UAH',
      billingPlanId: input.billingPlanId ?? null,
      featureMatrix: {
        b2cListing: false,
        bookingWidget: true,
        embeddedConsultation: true,
        prescriptionModule: true,
        analyticsPackage: true,
        brandedPatientPortal: true,
        misSync: false,
        advancedReports: false,
        audioArchive: false,
        apiAccess: false,
      },
      audioPolicy: { enabled: false, retentionDays: 30, consentRequired: true },
    });
    return this.repo.save(tenant);
  }

  async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
    const tenant = await this.getOrThrow(id);
    if (input.brandName !== undefined) tenant.brandName = input.brandName;
    if (input.primaryColor !== undefined) tenant.primaryColor = input.primaryColor;
    if (input.logoUrl !== undefined) tenant.logoUrl = input.logoUrl;
    if (input.locale !== undefined) tenant.locale = input.locale;
    if (input.features) {
      tenant.featureMatrix = { ...tenant.featureMatrix, ...input.features };
    }
    if (input.audioPolicy) {
      tenant.audioPolicy = { ...tenant.audioPolicy, ...input.audioPolicy };
    }
    return this.repo.save(tenant);
  }

  hasFeature(tenant: Tenant, feature: string): boolean {
    return tenant.featureMatrix?.[feature] === true;
  }

  async getRevenueShareRule(tenantId: string): Promise<RevenueShareRule | null> {
    return this.revShareRepo.findOne({ where: { tenantId, doctorId: null as never } });
  }
}
