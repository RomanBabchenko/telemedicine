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
import { Role } from '@telemed/shared-types';
import { AuthUser, CurrentUser, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
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

const ROLES_CLINIC_ADMIN_CAN_MANAGE: Role[] = [
  Role.DOCTOR,
  Role.CLINIC_OPERATOR,
  Role.CLINIC_ADMIN,
  Role.PATIENT,
];

const isPlatformActor = (roles: Role[]): boolean =>
  roles.includes(Role.PLATFORM_SUPER_ADMIN);

@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
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
      "Tenant-scoped by default. PLATFORM_SUPER_ADMIN can pass scope='all' to see every user across every tenant.",
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

    // Capture the membership BEFORE deletion so we know if we need to tear
    // down doctor-side catalog entries afterwards.
    const detailBefore = await this.users.getDetail(userId);
    const target = detailBefore.memberships.find((m) => m.id === membershipId);

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
    await this.users.setDefaultMembership(userId, membershipId, scope);
    const detail = await this.users.getDetail(userId);
    return toUserDetailResponse(detail);
  }

  @Patch(':id/status')
  @Auditable({ action: 'admin.user.status', resource: 'User', captureBody: true })
  @ApiOperation({
    summary: "Change a user's status",
    description: 'CLINIC_ADMIN may only change status for users with at least one membership in their tenant.',
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
    if (!isPlatformActor(actor.roles)) {
      await this.users.getDetail(id, this.tenantContext.getTenantId());
    }
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
    if (!isPlatformActor(actor.roles)) {
      await this.users.getDetail(id, this.tenantContext.getTenantId());
    }
    return this.users.resetPassword(id);
  }

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
