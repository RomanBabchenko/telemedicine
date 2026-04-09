import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { CurrentUser, AuthUser, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { ProviderService } from '../../provider/application/provider.service';
import { UserService, UserDetail } from '../application/user.service';
import {
  AddMembershipBodyDto,
  CreateUserBodyDto,
  ListUsersQueryDto,
  SetUserStatusBodyDto,
} from './dto';

const ROLES_CLINIC_ADMIN_CAN_MANAGE: Role[] = [
  Role.DOCTOR,
  Role.CLINIC_OPERATOR,
  Role.CLINIC_ADMIN,
  Role.PATIENT,
];

const isPlatformActor = (roles: Role[]): boolean =>
  roles.includes(Role.PLATFORM_SUPER_ADMIN);

const summarize = (detail: UserDetail) => ({
  ...detail,
  createdAt: detail.createdAt.toISOString(),
  memberships: detail.memberships.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
  })),
});

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
export class AdminUserController {
  constructor(
    private readonly users: UserService,
    private readonly providers: ProviderService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  async list(@Query() query: ListUsersQueryDto, @CurrentUser() actor: AuthUser) {
    const tenantScope = this.scopeTenantId(actor, query.scope);
    const result = await this.users.list({
      tenantId: tenantScope ?? undefined,
      role: query.role,
      status: query.status,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      ...result,
      items: result.items.map(summarize),
    };
  }

  // NOTE: declared before @Get(':id') so the static `lookup` segment is matched
  // before the param route. Same trick as the doctors controller.
  @Get('lookup')
  async lookup(@Query('email') email: string) {
    if (!email) throw new BadRequestException('email query param is required');
    const user = await this.users.findByEmail(email);
    if (!user) return { exists: false };
    return {
      exists: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const scope = isPlatformActor(actor.roles)
      ? undefined
      : this.tenantContext.getTenantId();
    const detail = await this.users.getDetail(id, scope);
    return summarize(detail);
  }

  @Post()
  @Auditable({ action: 'admin.user.created', resource: 'User', captureBody: true })
  async create(@Body() body: CreateUserBodyDto, @CurrentUser() actor: AuthUser) {
    const tenantId = body.tenantId ?? this.tenantContext.getTenantId();
    this.assertCanCreateRole(actor.roles, body.role);
    this.assertCanTouchTenant(actor, tenantId);

    if (body.role === Role.DOCTOR) {
      // Delegate to ProviderService — it knows how to create the full
      // User+Doctor+TenantProfile+AvailabilityRule+Slots bundle atomically.
      if (!body.password) {
        throw new BadRequestException('password is required when creating a DOCTOR');
      }
      // ProviderService.create runs in the current tenant context, so the
      // CLINIC_ADMIN scope is enforced implicitly. PLATFORM_SUPER_ADMIN must
      // be acting under that tenant's context too — that's how the existing
      // POST /doctors works.
      const dto = await this.providers.create({
        email: body.email,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
        specializations: body.specializations ?? [],
        languages: body.languages,
        licenseNumber: body.licenseNumber,
        yearsOfExperience: body.yearsOfExperience,
        bio: body.bio,
        basePrice: body.basePrice,
        defaultDurationMin: body.defaultDurationMin,
      });
      // Return the freshly-created user via the same shape as createOrAttach
      const user = await this.users.findByEmail(body.email);
      if (!user) throw new BadRequestException('Doctor created but user lookup failed');
      const detail = await this.users.getDetail(user.id);
      return { user: summarize(detail), reused: false, doctor: dto };
    }

    const result = await this.users.createOrAttach({
      email: body.email,
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      tenantId,
      role: body.role,
      isDefault: body.isDefault,
    });
    return {
      user: summarize(result.user),
      reused: result.reused,
      generatedPassword: result.generatedPassword,
    };
  }

  @Post(':id/memberships')
  @Auditable({ action: 'admin.membership.added', resource: 'UserTenantMembership' })
  async addMembership(
    @Param('id') userId: string,
    @Body() body: AddMembershipBodyDto,
    @CurrentUser() actor: AuthUser,
  ) {
    this.assertCanCreateRole(actor.roles, body.role);
    this.assertCanTouchTenant(actor, body.tenantId);
    await this.users.addMembership(
      userId,
      body.tenantId,
      body.role,
      body.isDefault ?? false,
    );
    // For DOCTOR role we also need to materialise the tenant-specific
    // catalog entries (DoctorTenantProfile, ServiceType, AvailabilityRule,
    // demo slots) — otherwise patients in this tenant won't see them.
    if (body.role === Role.DOCTOR) {
      await this.providers.attachToTenant(userId, body.tenantId);
    }
    const detail = await this.users.getDetail(userId);
    return summarize(detail);
  }

  @Delete(':id/memberships/:membershipId')
  @Auditable({ action: 'admin.membership.revoked', resource: 'UserTenantMembership' })
  async revokeMembership(
    @Param('id') userId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    const scope = isPlatformActor(actor.roles)
      ? undefined
      : this.tenantContext.getTenantId();

    // Capture the membership BEFORE deletion so we know if we need to
    // tear down doctor-side catalog entries afterwards.
    const detailBefore = await this.users.getDetail(userId);
    const target = detailBefore.memberships.find((m) => m.id === membershipId);

    await this.users.revokeMembership(membershipId, scope);

    if (target?.role === Role.DOCTOR) {
      await this.providers.detachFromTenant(userId, target.tenantId);
    }

    const detail = await this.users.getDetail(userId);
    return summarize(detail);
  }

  @Patch(':id/memberships/:membershipId/default')
  @Auditable({ action: 'admin.membership.default', resource: 'UserTenantMembership' })
  async setDefaultMembership(
    @Param('id') userId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    const scope = isPlatformActor(actor.roles)
      ? undefined
      : this.tenantContext.getTenantId();
    await this.users.setDefaultMembership(userId, membershipId, scope);
    const detail = await this.users.getDetail(userId);
    return summarize(detail);
  }

  @Patch(':id/status')
  @Auditable({ action: 'admin.user.status', resource: 'User', captureBody: true })
  async setStatus(
    @Param('id') id: string,
    @Body() body: SetUserStatusBodyDto,
    @CurrentUser() actor: AuthUser,
  ) {
    // CLINIC_ADMIN can only block users that have a membership in their tenant
    if (!isPlatformActor(actor.roles)) {
      await this.users.getDetail(id, this.tenantContext.getTenantId());
    }
    await this.users.setStatus(id, body.status);
    const detail = await this.users.getDetail(id);
    return summarize(detail);
  }

  @Post(':id/reset-password')
  @Auditable({ action: 'admin.user.password.reset', resource: 'User' })
  async resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    if (!isPlatformActor(actor.roles)) {
      await this.users.getDetail(id, this.tenantContext.getTenantId());
    }
    return this.users.resetPassword(id);
  }

  // ─── Guards ────────────────────────────────────────────────────────────────

  private scopeTenantId(actor: AuthUser, scope: 'mine' | 'all' | undefined): string | null {
    if (isPlatformActor(actor.roles) && scope === 'all') return null;
    return this.tenantContext.getTenantId();
  }

  private assertCanCreateRole(actorRoles: Role[], targetRole: Role): void {
    if (isPlatformActor(actorRoles)) return;
    if (!ROLES_CLINIC_ADMIN_CAN_MANAGE.includes(targetRole)) {
      throw new ForbiddenException(
        `CLINIC_ADMIN cannot manage role ${targetRole}`,
      );
    }
  }

  private assertCanTouchTenant(actor: AuthUser, targetTenantId: string): void {
    if (isPlatformActor(actor.roles)) return;
    const ctxTenant = this.tenantContext.getTenantId();
    if (targetTenantId !== ctxTenant) {
      throw new ForbiddenException('CLINIC_ADMIN can only touch users in own tenant');
    }
  }
}
