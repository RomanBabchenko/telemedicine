import {
  Body,
  Controller,
  Delete,
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
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { Public, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { OkResponseDto } from '../../../common/dto/ok-response.dto';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { ProviderService } from '../application/provider.service';
import {
  AvailabilityRuleResponseDto,
  CreateAvailabilityRuleBodyDto,
  CreateDoctorBodyDto,
  DoctorResponseDto,
  DoctorSearchQueryDto,
  DoctorsPageResponseDto,
  RegenerateSlotsResponseDto,
  UpdateDoctorBodyDto,
} from './dto';
import { toAvailabilityRuleResponse } from './mappers/doctor.mapper';

@ApiTags('doctors')
@Controller('doctors')
export class ProviderController {
  constructor(private readonly service: ProviderService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Search published doctors in the current tenant',
    description:
      'Public endpoint — only verified + published doctors are returned. Use /doctors/admin/list for the admin view.',
    operationId: 'searchDoctors',
  })
  @ApiOkResponse({ type: DoctorsPageResponseDto })
  @ApiStandardErrors()
  async search(
    @Query() query: DoctorSearchQueryDto,
  ): Promise<DoctorsPageResponseDto> {
    const result = await this.service.search({ ...query, includeUnverified: false });
    return toDoctorsPage(result);
  }

  // NOTE: declared before `@Get(':id')` so the static `admin/list` segment
  // is matched before the param route.
  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'List every doctor in the current tenant (admin view)',
    description:
      'Returns unverified and unpublished doctors too — used by the clinic admin to manage verification and activation.',
    operationId: 'listDoctorsForAdmin',
  })
  @ApiOkResponse({ type: DoctorsPageResponseDto })
  @ApiStandardErrors()
  async searchForAdmin(
    @Query() query: DoctorSearchQueryDto,
  ): Promise<DoctorsPageResponseDto> {
    const result = await this.service.search({
      ...query,
      includeUnverified: true,
      includeUnpublished: true,
    });
    return toDoctorsPage(result);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Fetch a single doctor card in the current tenant',
    operationId: 'getDoctorById',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DoctorResponseDto })
  @ApiStandardErrors()
  getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<DoctorResponseDto> {
    return this.service.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.created', resource: 'Doctor', captureBody: true })
  @ApiAuth()
  @ApiOperation({
    summary: 'Create a new doctor (User + Doctor + TenantProfile + Schedule)',
    description:
      'Atomic: creates the User, Doctor, DoctorTenantProfile, default ServiceType, Mon–Fri availability rules, and 14 days of demo slots. All tied to the tenant in context.',
    operationId: 'createDoctor',
  })
  @ApiBody({ type: CreateDoctorBodyDto })
  @ApiCreatedResponse({ type: DoctorResponseDto })
  @ApiStandardErrors()
  create(@Body() body: CreateDoctorBodyDto): Promise<DoctorResponseDto> {
    return this.service.create(body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.updated', resource: 'Doctor' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Update doctor profile fields',
    description:
      'Patch semantics — only supplied fields are changed. Price/name changes are also synced into the tenant profile.',
    operationId: 'updateDoctor',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateDoctorBodyDto })
  @ApiOkResponse({ type: DoctorResponseDto })
  @ApiStandardErrors()
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDoctorBodyDto,
  ): Promise<DoctorResponseDto> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.deactivated', resource: 'Doctor' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Deactivate a doctor in the current tenant',
    description:
      'Soft-deactivate: sets isPublished=false on the tenant profile. The User/Doctor rows stay intact and can be re-activated via POST /:id/activate.',
    operationId: 'deactivateDoctor',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OkResponseDto> {
    return this.service.remove(id) as Promise<OkResponseDto>;
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.activated', resource: 'Doctor' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Re-publish a deactivated doctor in the current tenant',
    operationId: 'activateDoctor',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  activate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OkResponseDto> {
    return this.service.activate(id) as Promise<OkResponseDto>;
  }

  @Post(':id/documents/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.verified', resource: 'Doctor' })
  @ApiAuth()
  @ApiOperation({
    summary: "Mark a doctor's verification status as VERIFIED",
    operationId: 'verifyDoctor',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  verify(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OkResponseDto> {
    return this.service.verify(id) as Promise<OkResponseDto>;
  }

  @Post(':id/slots/regenerate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'doctor.slots.regenerated', resource: 'Doctor' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Regenerate 14 days of demo slots for a doctor',
    description: 'Future OPEN slots are dropped and re-created; HELD/BOOKED history is preserved.',
    operationId: 'regenerateDoctorSlots',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RegenerateSlotsResponseDto })
  @ApiStandardErrors()
  regenerateSlots(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RegenerateSlotsResponseDto> {
    return this.service.regenerateSlots(id);
  }

  @Get(':id/availability')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: "List a doctor's availability rules in the current tenant",
    operationId: 'listDoctorAvailability',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [AvailabilityRuleResponseDto] })
  @ApiStandardErrors()
  listAvailability(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AvailabilityRuleResponseDto[]> {
    return this.service.listAvailabilityRules(id);
  }

  @Post(':id/availability')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN)
  @Auditable({ action: 'availability.rule.created', resource: 'AvailabilityRule' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Add an availability rule',
    operationId: 'createDoctorAvailabilityRule',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateAvailabilityRuleBodyDto })
  @ApiCreatedResponse({ type: AvailabilityRuleResponseDto })
  @ApiStandardErrors()
  async createAvailability(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateAvailabilityRuleBodyDto,
  ): Promise<AvailabilityRuleResponseDto> {
    const rule = await this.service.createAvailabilityRule(id, body);
    return toAvailabilityRuleResponse(rule);
  }

  @Delete(':id/availability/:ruleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR, Role.CLINIC_ADMIN)
  @Auditable({ action: 'availability.rule.deleted', resource: 'AvailabilityRule' })
  @ApiAuth()
  @ApiOperation({
    summary: 'Remove an availability rule',
    operationId: 'deleteDoctorAvailabilityRule',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'ruleId', format: 'uuid' })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiStandardErrors()
  deleteAvailability(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
  ): Promise<OkResponseDto> {
    return this.service.deleteAvailabilityRule(id, ruleId) as Promise<OkResponseDto>;
  }
}

const toDoctorsPage = (
  result: { items: DoctorResponseDto[]; total: number; page: number; pageSize: number },
): DoctorsPageResponseDto => {
  const limit = result.pageSize;
  return {
    items: result.items,
    meta: {
      total: result.total,
      page: result.page,
      limit,
      pageCount: limit > 0 ? Math.ceil(result.total / limit) : 0,
    },
  };
};
