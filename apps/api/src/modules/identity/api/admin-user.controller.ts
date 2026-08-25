import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  Role,
  canManageRole,
  isPlatformActor,
  manageableRolesFor,
} from '@telemed/shared-types';
import { AuthUser, CurrentUser, Roles } from '../../../common/auth/decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { ProviderService } from '../../provider/application/provider.service';
import { PatientService } from '../../patient/application/patient.service';
import { UserDetail, UserService } from '../application/user.service';
import {
  AddMembershipBodyDto,
  CreateUserBodyDto,
  CreateUserResponseDto,
  ListUsersQueryDto,
  ResetPasswordResponseDto,
  SetUserStatusBodyDto,
  UserDetailResponseDto,
  UserLookupQueryDto,
  UserLookupResponseDto,
  UsersPageResponseDto,
} from './dto';
import {
  toUserDetailResponse,
  toUserLookupResponse,
} from './mappers/user.mapper';

// Who may manage which roles lives in MANAGEABLE_ROLES (shared-types/rbac):
//   PLATFORM_SUPER_ADMIN → everyone
//   CLINIC_ADMIN         → DOCTOR, CLINIC_OPERATOR, CLINIC_ADMIN, PATIENT,
//                          INTEGRATION_ADMIN, CHIEF_MEDICAL_OFFICER
//   INTEGRATION_ADMIN    → INTEGRATION_ADMIN, CHIEF_MEDICAL_OFFICER only
// Non-platform actors are additionally confined to their own tenant and
// never see / touch users holding a role outside their manageable set.

@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN, Role.INTEGRATION_ADMIN)
@ApiAuth()
export class AdminUserController {
  constructor(
    private readonly users: UserService,
    private readonly providers: ProviderService,
    private readonly patientService: PatientService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List users in the current tenant',
    description:
      "Tenant-scoped by default. PLATFORM_SUPER_ADMIN can pass scope='all' to see every user across every tenant. Clinic-level actors only see users whose roles they are allowed to manage (INTEGRATION_ADMIN → INTEGRATION_ADMIN / CHIEF_MEDICAL_OFFICER).",
    operationId: 'listUsers',
  })
  @ApiOkResponse({ type: UsersPageResponseDto })
  @ApiStandardErrors()
  async list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UsersPageResponseDto> {
    const tenantScope = this.scopeTenantId(actor, query.scope);
    const result = await this.users.list({
      tenantId: tenantScope ?? undefined,
      role: query.role,
      roles: isPlatformActor(actor.roles) ? undefined : manageableRolesFor(actor.roles),
      status: query.status,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
    const limit = result.pageSize;
    return {
      items: result.items.map(toUserDetailResponse),
      meta: {
        total: result.total,
        page: result.page,
        limit,
        pageCount: limit > 0 ? Math.ceil(result.total / limit) : 0,
      },
    };
  }

  // NOTE: declared before @Get(':id') so the static `lookup` segment is matched
  // before the param route. Same trick as the doctors controller.
  @Get('lookup')
  @ApiOperation({
    summary: 'Look up a user by email',
    description: 'Returns { exists: false } when no user is found — used by the invite UX to decide between create vs. attach-membership.',
    operationId: 'lookupUser',
  })
  @ApiOkResponse({ type: UserLookupResponseDto })
  @ApiStandardErrors()
  async lookup(@Query() query: UserLookupQueryDto): Promise<UserLookupResponseDto> {
    if (!query.email) throw new BadRequestException('email query param is required');
    const user = await this.users.findByEmail(query.email);
    return toUserLookupResponse(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Fetch a single user with their memberships',
    operationId: 'getUserById',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiStandardErrors()
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDetailResponseDto> {
    const scope = isPlatformActor(actor.roles)
      ? undefined
      : this.tenantContext.getTenantId();
    const detail = await this.users.getDetail(id, scope);
    return toUserDetailResponse(detail);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auditable({ action: 'admin.user.created', resource: 'User', captureBody: true })
  @ApiOperation({
    summary: 'Create a new user or attach a membership to an existing one',
    description:
      'If the email is new, a User is created with the given role. If the email already exists, a new membership is attached (returns reused=true). DOCTOR role also materialises the full Doctor+Profile+Schedule bundle via ProviderService.',
    operationId: 'createUser',
  })
  @ApiOkResponse({ type: CreateUserResponseDto })
  @ApiStandardErrors()
  async create(
    @Body() body: CreateUserBodyDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<CreateUserResponseDto> {
    const tenantId = body.tenantId ?? this.tenantContext.getTenantId();
    this.assertCanCreateRole(actor.roles, body.role);
    this.assertCanTouchTenant(actor, tenantId);

    if (body.role === Role.DOCTOR) {
      // Delegate to ProviderService — it owns the atomic
      // User+Doctor+TenantProfile+AvailabilityRule+Slots bundle.
      if (!body.password) {
        throw new BadRequestException('password is required when creating a DOCTOR');
      }
      const doctor = await this.providers.create({
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
      const user = await this.users.findByEmail(body.email);
      if (!user) throw new BadRequestException('Doctor created but user lookup failed');
      const detail = await this.users.getDetail(user.id);
      return {
        user: toUserDetailResponse(detail),
        reused: false,
        doctor: doctor as unknown as Record<string, unknown>,
      };
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

    if (body.role === Role.PATIENT) {
      const user = await this.users.findByEmail(body.email);
      if (user) {
        await this.patientService.ensurePatientProfile(user);
      }
    }

    return {
      user: toUserDetailResponse(result.user),
      reused: result.reused,
      generatedPassword: result.generatedPassword,
    };
  }

  @Post(':id/memberships')
  @HttpCode(HttpStatus.CREATED)
  @Auditable({ action: 'admin.membership.added', resource: 'UserTenantMembership' })
  @ApiOperation({
    summary: 'Grant a new tenant membership to an existing user',
    description:
      'For DOCTOR role, also materialises the tenant-specific catalog entries so the doctor becomes visible to patients. For PATIENT role, ensures the Patient record exists.',
    operationId: 'addMembership',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiStandardErrors()
  async addMembership(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Body() body: AddMembershipBodyDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDetailResponseDto> {
    this.assertCanCreateRole(actor.roles, body.role);
    this.assertCanTouchTenant(actor, body.tenantId);
    await this.assertCanTouchUser(actor, userId);
    await this.users.addMembership(
      userId,
      body.tenantId,
      body.role,
      body.isDefault ?? false,
    );
    if (body.role === Role.DOCTOR) {
      await this.providers.attachToTenant(userId, body.tenantId);
    }
    if (body.role === Role.PATIENT) {
      const user = await this.users.findById(userId);
      if (user) {
        await this.patientService.ensurePatientProfile(user);
      }
    }
    const detail = await this.users.getDetail(userId);
    return toUserDetailResponse(detail);
  }

  @Delete(':id/memberships/:membershipId')
  @Auditable({ action: 'admin.membership.revoked', resource: 'UserTenantMembership' })
  @ApiOperation({
    summary: 'Revoke a tenant membership',
    description: 'If the revoked membership was DOCTOR, the matching tenant-scoped catalog entries are also torn down.',
    operationId: 'revokeMembership',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id' })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiStandardErrors()
  async revokeMembership(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDetailResponseDto> {
    const scope = isPlatformActor(actor.roles)
      ? undefined
      : this.tenantContext.getTenantId();
    await this.assertCanTouchUser(actor, userId);

    // Capture the membership BEFORE deletion so we know if we need to tear
    // down doctor-side catalog entries afterwards.
    const detailBefore = await this.users.getDetail(userId);
    const target = detailBefore.memberships.find((m) => m.id === membershipId);
    if (target) this.assertCanCreateRole(actor.roles, target.role);

    await this.users.revokeMembership(membershipId, scope);

    if (target?.role === Role.DOCTOR) {
      await this.providers.detachFromTenant(userId, target.tenantId);
    }

    const detail = await this.users.getDetail(userId);
    return toUserDetailResponse(detail);
  }

  @Patch(':id/memberships/:membershipId/default')
  @Auditable({ action: 'admin.membership.default', resource: 'UserTenantMembership' })
  @ApiOperation({
    summary: "Promote a membership to the user's default tenant",
    operationId: 'setDefaultMembership',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id' })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiStandardErrors()
  async setDefaultMembership(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDetailResponseDto> {
    const scope = isPlatformActor(actor.roles)
      ? undefined
      : this.tenantContext.getTenantId();
    await this.assertCanTouchUser(actor, userId);
    await this.users.setDefaultMembership(userId, membershipId, scope);
    const detail = await this.users.getDetail(userId);
    return toUserDetailResponse(detail);
  }

  @Patch(':id/status')
  @Auditable({ action: 'admin.user.status', resource: 'User', captureBody: true })
  @ApiOperation({
    summary: "Change a user's status",
    description: 'Clinic-level actors may only change status for users in their own tenant whose roles they are allowed to manage.',
    operationId: 'setUserStatus',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserDetailResponseDto })
  @ApiStandardErrors()
  async setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetUserStatusBodyDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDetailResponseDto> {
    await this.assertCanTouchUser(actor, id);
    await this.users.setStatus(id, body.status);
    const detail = await this.users.getDetail(id);
    return toUserDetailResponse(detail);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'admin.user.password.reset', resource: 'User' })
  @ApiOperation({
    summary: 'Reset a user password to a fresh temporary value',
    description: 'Returns the temporary password so the admin can hand it to the user.',
    operationId: 'resetUserPassword',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ResetPasswordResponseDto })
  @ApiStandardErrors()
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ResetPasswordResponseDto> {
    await this.assertCanTouchUser(actor, id);
    return this.users.resetPassword(id);
  }

  private scopeTenantId(actor: AuthUser, scope: 'mine' | 'all' | undefined): string | null {
    if (isPlatformActor(actor.roles) && scope === 'all') return null;
    return this.tenantContext.getTenantId();
  }

  private assertCanCreateRole(actorRoles: Role[], targetRole: Role): void {
    if (!canManageRole(actorRoles, targetRole)) {
      throw new ForbiddenException(
        `Role ${actorRoles.join('/')} cannot manage role ${targetRole}`,
      );
    }
  }

  private assertCanTouchTenant(actor: AuthUser, targetTenantId: string): void {
    if (isPlatformActor(actor.roles)) return;
    const ctxTenant = this.tenantContext.getTenantId();
    if (targetTenantId !== ctxTenant) {
      throw new ForbiddenException('You may only manage users in your own tenant');
    }
  }

  // Non-platform actors may mutate a user only when (a) the user has a
  // membership in the actor's tenant and (b) every role the user holds in
  // that tenant is one the actor is allowed to manage. This is what stops an
  // INTEGRATION_ADMIN from blocking / resetting a CLINIC_ADMIN.
  private async assertCanTouchUser(actor: AuthUser, userId: string): Promise<void> {
    if (isPlatformActor(actor.roles)) return;
    const tenantId = this.tenantContext.getTenantId();
    await this.users.getDetail(userId, tenantId); // 404 when outside the tenant
    const targetRoles = await this.users.getMembershipRolesInTenant(userId, tenantId);
    const allowed = manageableRolesFor(actor.roles);
    if (targetRoles.some((r) => !allowed.includes(r))) {
      throw new ForbiddenException('You are not allowed to manage this user');
    }
  }
}
