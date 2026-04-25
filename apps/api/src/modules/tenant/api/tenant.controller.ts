import {
  Body,
  Controller,
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
import { Public, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  ): Promise<TenantResponseDto> {
    const t = await this.service.update(id, body);
    return toTenantResponse(t);
  }
}
