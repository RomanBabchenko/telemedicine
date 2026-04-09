import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '@telemed/shared-types';
import { User } from '../domain/entities/user.entity';
import { UserTenantMembership } from '../domain/entities/user-tenant-membership.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserTenantMembership)
    private readonly memberships: Repository<UserTenantMembership>,
  ) {}

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

  async ensureMembership(userId: string, tenantId: string, role: Role, isDefault = false): Promise<void> {
    const existing = await this.memberships.findOne({
      where: { userId, tenantId, role },
    });
    if (existing) return;
    await this.memberships.save(
      this.memberships.create({ userId, tenantId, role, isDefault }),
    );
  }
}
