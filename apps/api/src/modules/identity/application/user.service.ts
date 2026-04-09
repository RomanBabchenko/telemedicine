import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { Role } from '@telemed/shared-types';
import { User } from '../domain/entities/user.entity';
import { UserTenantMembership } from '../domain/entities/user-tenant-membership.entity';
import { Tenant } from '../../tenant/domain/entities/tenant.entity';
import { PasswordService } from './password.service';

interface ListUsersFilters {
  tenantId?: string;
  role?: Role;
  status?: 'ACTIVE' | 'PENDING' | 'BLOCKED';
  search?: string;
  page?: number;
  pageSize?: number;
}

interface CreateUserInput {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  tenantId: string;
  role: Role;
  isDefault?: boolean;
}

export interface UserDetail {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: 'ACTIVE' | 'PENDING' | 'BLOCKED';
  mfaEnabled: boolean;
  createdAt: Date;
  memberships: Array<{
    id: string;
    userId: string;
    tenantId: string;
    tenantName: string | null;
    role: Role;
    isDefault: boolean;
    createdAt: Date;
  }>;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserTenantMembership)
    private readonly memberships: Repository<UserTenantMembership>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly passwords: PasswordService,
  ) {}

  // ─── Lookup helpers (used by AuthService and AdminUserController) ──────────

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const u = await this.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.users.findOne({ where: { phone } });
  }

  async getRoles(userId: string, tenantId?: string | null): Promise<Role[]> {
    const memberships = await this.memberships.find({
      where: tenantId ? { userId, tenantId } : { userId },
    });
    return memberships.map((m) => m.role);
  }

  async getDefaultTenantId(userId: string): Promise<string | null> {
    const m = await this.memberships.findOne({
      where: { userId, isDefault: true },
    });
    if (m) return m.tenantId;
    const any = await this.memberships.findOne({ where: { userId } });
    return any?.tenantId ?? null;
  }

  save(user: User): Promise<User> {
    return this.users.save(user);
  }

  async ensureMembership(
    userId: string,
    tenantId: string,
    role: Role,
    isDefault = false,
  ): Promise<void> {
    const existing = await this.memberships.findOne({
      where: { userId, tenantId, role },
    });
    if (existing) return;
    await this.memberships.save(
      this.memberships.create({ userId, tenantId, role, isDefault }),
    );
  }

  // ─── Admin: list / detail ──────────────────────────────────────────────────

  /**
   * List users. If `tenantId` is set, only users with at least one membership
   * in that tenant are returned (CLINIC_ADMIN scope). Otherwise (`scope=all`,
   * PLATFORM_SUPER_ADMIN), every user is returned.
   *
   * Each row includes the user's full membership list and resolved tenant
   * names so the UI can render badges without N+1 lookups.
   */
  async list(filters: ListUsersFilters): Promise<{
    items: UserDetail[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 100);

    // Step 1: collect candidate user IDs from memberships if there's a
    // tenant or role filter.
    let userIdFilter: string[] | null = null;
    if (filters.tenantId || filters.role) {
      const where: Record<string, unknown> = {};
      if (filters.tenantId) where.tenantId = filters.tenantId;
      if (filters.role) where.role = filters.role;
      const matched = await this.memberships.find({ where });
      userIdFilter = Array.from(new Set(matched.map((m) => m.userId)));
      if (userIdFilter.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    // Step 2: load users (with optional search/status filter).
    const baseUserWhere: Record<string, unknown> = {};
    if (userIdFilter) baseUserWhere.id = In(userIdFilter);
    if (filters.status) baseUserWhere.status = filters.status;

    let users: User[];
    let total: number;
    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      // OR over three columns — TypeORM expands an array into UNION-style WHERE.
      [users, total] = await this.users.findAndCount({
        where: [
          { ...baseUserWhere, email: ILike(term) },
          { ...baseUserWhere, firstName: ILike(term) },
          { ...baseUserWhere, lastName: ILike(term) },
        ],
        order: { createdAt: 'DESC' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
    } else {
      [users, total] = await this.users.findAndCount({
        where: baseUserWhere,
        order: { createdAt: 'DESC' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
    }

    if (users.length === 0) {
      return { items: [], total, page, pageSize };
    }

    // Step 3: hydrate memberships for the page.
    const allUserIds = users.map((u) => u.id);
    const allMemberships = await this.memberships.find({
      where: { userId: In(allUserIds) },
    });
    const tenantIds = Array.from(new Set(allMemberships.map((m) => m.tenantId)));
    const tenants = tenantIds.length
      ? await this.tenants.find({ where: { id: In(tenantIds) } })
      : [];
    const tenantNameById = new Map(tenants.map((t) => [t.id, t.brandName] as const));

    const membershipsByUser = new Map<string, UserTenantMembership[]>();
    for (const m of allMemberships) {
      const arr = membershipsByUser.get(m.userId) ?? [];
      arr.push(m);
      membershipsByUser.set(m.userId, arr);
    }

    const items: UserDetail[] = users.map((u) =>
      this.toDetail(u, membershipsByUser.get(u.id) ?? [], tenantNameById),
    );

    return { items, total, page, pageSize };
  }

  /**
   * Get a single user with memberships. If `scopedTenantId` is set, throws
   * NotFoundException unless the user has at least one membership in that
   * tenant — this prevents CLINIC_ADMIN from peeking at foreign users by id.
   */
  async getDetail(userId: string, scopedTenantId?: string): Promise<UserDetail> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const memberships = await this.memberships.find({ where: { userId } });

    if (scopedTenantId) {
      const inScope = memberships.some((m) => m.tenantId === scopedTenantId);
      if (!inScope) throw new NotFoundException('User not found');
    }

    const tenantIds = Array.from(new Set(memberships.map((m) => m.tenantId)));
    const tenants = tenantIds.length
      ? await this.tenants.find({ where: { id: In(tenantIds) } })
      : [];
    const tenantNameById = new Map(tenants.map((t) => [t.id, t.brandName] as const));

    return this.toDetail(user, memberships, tenantNameById);
  }

  // ─── Admin: invite-by-email create ─────────────────────────────────────────

  /**
   * Create a new user with the given role/tenant, OR if the email is already
   * in use, attach a new membership to the existing user.
   *
   * Returns the resulting UserDetail and a generated temporary password if
   * the caller didn't supply one (only for fresh creates).
   */
  async createOrAttach(input: CreateUserInput): Promise<{
    user: UserDetail;
    generatedPassword?: string;
    reused: boolean;
  }> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      // Existing user: just add a new membership (or surface a clean conflict).
      const already = await this.memberships.findOne({
        where: { userId: existing.id, tenantId: input.tenantId, role: input.role },
      });
      if (already) {
        throw new ConflictException(
          'User already has this role in this tenant',
        );
      }
      await this.ensureMembership(
        existing.id,
        input.tenantId,
        input.role,
        input.isDefault ?? false,
      );
      const detail = await this.getDetail(existing.id);
      return { user: detail, reused: true };
    }

    let temporaryPassword: string | undefined;
    let passwordToHash = input.password;
    if (!passwordToHash) {
      temporaryPassword = generateTempPassword();
      passwordToHash = temporaryPassword;
    }
    const passwordHash = await this.passwords.hash(passwordToHash);

    const user = this.users.create({
      email: input.email,
      phone: input.phone ?? null,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    await this.users.save(user);

    await this.memberships.save(
      this.memberships.create({
        userId: user.id,
        tenantId: input.tenantId,
        role: input.role,
        isDefault: input.isDefault ?? true,
      }),
    );

    const detail = await this.getDetail(user.id);
    return { user: detail, generatedPassword: temporaryPassword, reused: false };
  }

  // ─── Admin: membership management ──────────────────────────────────────────

  async addMembership(
    userId: string,
    tenantId: string,
    role: Role,
    isDefault = false,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.memberships.findOne({
      where: { userId, tenantId, role },
    });
    if (existing) {
      throw new ConflictException('User already has this role in this tenant');
    }

    if (isDefault) {
      // Demote any other defaults for this user.
      await this.memberships.update({ userId, isDefault: true }, { isDefault: false });
    }

    await this.memberships.save(
      this.memberships.create({ userId, tenantId, role, isDefault }),
    );
  }

  /** Removes one membership row by id. Scoped check prevents cross-tenant abuse. */
  async revokeMembership(membershipId: string, scopedTenantId?: string): Promise<void> {
    const membership = await this.memberships.findOne({ where: { id: membershipId } });
    if (!membership) throw new NotFoundException('Membership not found');
    if (scopedTenantId && membership.tenantId !== scopedTenantId) {
      throw new ForbiddenException('Cannot revoke membership in another tenant');
    }
    await this.memberships.delete({ id: membershipId });
  }

  async setDefaultMembership(
    userId: string,
    membershipId: string,
    scopedTenantId?: string,
  ): Promise<void> {
    const target = await this.memberships.findOne({
      where: { id: membershipId, userId },
    });
    if (!target) throw new NotFoundException('Membership not found');
    if (scopedTenantId && target.tenantId !== scopedTenantId) {
      throw new ForbiddenException('Cannot change default in another tenant');
    }
    await this.memberships.update({ userId, isDefault: true }, { isDefault: false });
    target.isDefault = true;
    await this.memberships.save(target);
  }

  // ─── Admin: status / password ──────────────────────────────────────────────

  async setStatus(userId: string, status: 'ACTIVE' | 'BLOCKED'): Promise<void> {
    const user = await this.getByIdOrThrow(userId);
    user.status = status;
    await this.users.save(user);
  }

  async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const user = await this.getByIdOrThrow(userId);
    const temporaryPassword = generateTempPassword();
    user.passwordHash = await this.passwords.hash(temporaryPassword);
    await this.users.save(user);
    return { temporaryPassword };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private toDetail(
    user: User,
    memberships: UserTenantMembership[],
    tenantNameById: Map<string, string>,
  ): UserDetail {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      memberships: memberships.map((m) => ({
        id: m.id,
        userId: m.userId,
        tenantId: m.tenantId,
        tenantName: tenantNameById.get(m.tenantId) ?? null,
        role: m.role,
        isDefault: m.isDefault,
        createdAt: m.createdAt,
      })),
    };
  }
}

function generateTempPassword(): string {
  // 12 chars from base64url, easy to copy from the admin UI.
  return randomBytes(9).toString('base64url');
}
