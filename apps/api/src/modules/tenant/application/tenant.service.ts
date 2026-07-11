import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_FEATURE_MATRIX,
  Role,
  type TenantFeatureKey,
} from '@telemed/shared-types';
import { AppConfig } from '../../../config/env.config';
import { Tenant } from '../domain/entities/tenant.entity';
import { RevenueShareRule } from '../domain/entities/revenue-share-rule.entity';

export interface UpdateTenantInput {
  brandName?: string;
  primaryColor?: string;
  logoUrl?: string | null;
  locale?: string;
  features?: Record<string, boolean>;
  audioPolicy?: { enabled?: boolean; retentionDays?: number; consentRequired?: boolean };
  invitePolicy?: { bindIp?: boolean; bindUserAgent?: boolean };
  loginPolicy?: { doctorEnabled?: boolean; patientEnabled?: boolean };
}

// Roles that bypass loginPolicy gating — admin / internal accounts must
// always be able to log in, otherwise an operator could lock themselves
// out by toggling both flags off. MIS_SERVICE is a machine account used
// by integrations and must keep running regardless of UI policy.
const ALWAYS_ALLOWED_ROLES: ReadonlySet<Role> = new Set([
  Role.PLATFORM_SUPER_ADMIN,
  Role.CLINIC_ADMIN,
  Role.MIS_SERVICE,
  Role.AUDITOR,
]);

// Platform-wide kill switches (from env) — when true, the matching role
// is blocked across *every* tenant regardless of per-tenant loginPolicy.
// Admin roles always bypass via ALWAYS_ALLOWED_ROLES, so an operator can
// safely flip these without losing console access.
export interface GlobalLoginDisable {
  doctor?: boolean;
  patient?: boolean;
}

export const canLoginWithPolicy = (
  policy: { doctorEnabled?: boolean; patientEnabled?: boolean } | null | undefined,
  roles: Role[],
  globalDisable: GlobalLoginDisable = {},
): boolean => {
  if (roles.some((r) => ALWAYS_ALLOWED_ROLES.has(r))) return true;
  // Missing flag = enabled (backwards-compatible default for tenants
  // that have never had this configured). Global env-var disable wins
  // over the per-tenant default — both must be "not blocked" for the
  // role to pass.
  const doctorOk = !globalDisable.doctor && policy?.doctorEnabled !== false;
  const patientOk = !globalDisable.patient && policy?.patientEnabled !== false;
  return roles.some(
    (r) =>
      (r === Role.DOCTOR && doctorOk) || (r === Role.PATIENT && patientOk),
  );
};

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant) private readonly repo: Repository<Tenant>,
    @InjectRepository(RevenueShareRule)
    private readonly revShareRepo: Repository<RevenueShareRule>,
    private readonly config: AppConfig,
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
      featureMatrix: { ...DEFAULT_FEATURE_MATRIX },
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
    if (input.invitePolicy) {
      tenant.invitePolicy = { ...tenant.invitePolicy, ...input.invitePolicy };
    }
    if (input.loginPolicy) {
      tenant.loginPolicy = { ...tenant.loginPolicy, ...input.loginPolicy };
    }
    return this.repo.save(tenant);
  }

  hasFeature(tenant: Tenant, feature: string): boolean {
    // Fall back to the canonical defaults when the key is absent — tenants
    // created outside TenantService.create() have an empty matrix, and an
    // empty matrix must not mean "every module off".
    const explicit = tenant.featureMatrix?.[feature];
    if (explicit !== undefined) return explicit === true;
    return DEFAULT_FEATURE_MATRIX[feature as TenantFeatureKey] === true;
  }

  // Whether full login (email+pwd / OTP / magic-link / patient register)
  // is allowed for *this* user's roles in this tenant. Invite-link
  // consumption is unaffected — that's a separate endpoint with a
  // different JWT scope. See `canLoginWithPolicy` for the role-by-role
  // logic and the always-allowed admin/internal bypass.
  async canLogin(tenantId: string, roles: Role[]): Promise<boolean> {
    const tenant = await this.findById(tenantId);
    if (!tenant) return false;
    return canLoginWithPolicy(tenant.loginPolicy, roles, {
      doctor: this.config.auth.disableLoginDoctor,
      patient: this.config.auth.disableLoginPatient,
    });
  }

  async getRevenueShareRule(tenantId: string): Promise<RevenueShareRule | null> {
    return this.revShareRepo.findOne({ where: { tenantId, doctorId: null as never } });
  }
}
