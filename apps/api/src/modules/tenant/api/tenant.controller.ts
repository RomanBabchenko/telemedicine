import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { AuthUser, CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { TenantService } from '../application/tenant.service';
import {
  CreateTenantBodyDto,
  TenantResponseDto,
  UpdateTenantBodyDto,
} from './dto';
import { toTenantResponse } from './mappers/tenant.mapper';

@ApiTags('tenants')
@Controller()
export class TenantController {
  constructor(
    private readonly service: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('tenants/current')
  @Public()
  @ApiOperation({
    summary: 'Return the tenant resolved from the current request',
    description: 'Public endpoint — used by the SPA to bootstrap branding / feature flags before login.',
    operationId: 'getCurrentTenant',
  })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiStandardErrors()
  async current(): Promise<TenantResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const t = await this.service.findById(tenantId);
    if (!t) throw new NotFoundException();
    return toTenantResponse(t);
  }

  @Get('admin/tenants')
  @UseGuards(RolesGuard)
  @Roles(Role.PLATFORM_SUPER_ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'List every tenant on the platform',
    operationId: 'listAllTenants',
  })
  @ApiOkResponse({ type: [TenantResponseDto] })
  @ApiStandardErrors()
  async list(): Promise<TenantResponseDto[]> {
    const tenants = await this.service.list();
    return tenants.map(toTenantResponse);
  }

  @Post('admin/tenants')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'tenant.created', resource: 'Tenant', captureBody: true })
  @ApiAuth()
  @ApiOperation({
    summary: 'Create a new tenant',
    operationId: 'createTenant',
  })
  @ApiBody({ type: CreateTenantBodyDto })
  @ApiCreatedResponse({ type: TenantResponseDto })
  @ApiStandardErrors()
  async create(@Body() body: CreateTenantBodyDto): Promise<TenantResponseDto> {
    const t = await this.service.create(body);
    return toTenantResponse(t);
  }

  @Patch('admin/tenants/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.CLINIC_ADMIN)
  @Auditable({ action: 'tenant.updated', resource: 'Tenant', captureBody: true })
  @ApiAuth()
  @ApiOperation({
    summary: 'Update tenant branding / features / policies',
    description: 'CLINIC_ADMIN is allowed only for their own tenant; PLATFORM_SUPER_ADMIN may touch any.',
    operationId: 'updateTenant',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTenantBodyDto })
  @ApiOkResponse({ type: TenantResponseDto })
  @ApiStandardErrors()
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTenantBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TenantResponseDto> {
    // Enforce what the description promises: a CLINIC_ADMIN may only touch
    // their own tenant. Without this check any clinic admin knowing another
    // tenant's UUID could rewrite its branding/features/policies.
    const isPlatformAdmin = user.roles.includes(Role.PLATFORM_SUPER_ADMIN);
    if (!isPlatformAdmin && user.tenantId !== id) {
      throw new ForbiddenException('You may only update your own tenant');
    }
    const t = await this.service.update(id, body);
    return toTenantResponse(t);
  }
}
