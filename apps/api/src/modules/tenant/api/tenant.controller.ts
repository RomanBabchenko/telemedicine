import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { Public, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { Auditable } from '../../../common/audit/decorators';
import { TenantService } from '../application/tenant.service';
import { CreateTenantBodyDto, UpdateTenantBodyDto } from './dto';
import { Tenant } from '../domain/entities/tenant.entity';

const toDto = (t: Tenant) => ({
  id: t.id,
  slug: t.slug,
  brandName: t.brandName,
  subdomain: t.subdomain,
  primaryColor: t.primaryColor,
  logoUrl: t.logoUrl,
  locale: t.locale,
  currency: t.currency,
  features: t.featureMatrix,
  audioPolicy: t.audioPolicy,
});

@ApiTags('tenants')
@Controller()
export class TenantController {
  constructor(
    private readonly service: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('tenants/current')
  @Public()
  async current() {
    const tenantId = this.tenantContext.getTenantId();
    const t = await this.service.findById(tenantId);
    if (!t) throw new NotFoundException();
    return toDto(t);
  }

  @ApiBearerAuth()
  @Get('admin/tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_SUPER_ADMIN)
  async list() {
    const tenants = await this.service.list();
    return tenants.map(toDto);
  }

  @ApiBearerAuth()
  @Post('admin/tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'tenant.created', resource: 'Tenant', captureBody: true })
  async create(@Body() body: CreateTenantBodyDto) {
    const t = await this.service.create(body);
    return toDto(t);
  }

  @ApiBearerAuth()
  @Patch('admin/tenants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.CLINIC_ADMIN)
  @Auditable({ action: 'tenant.updated', resource: 'Tenant', captureBody: true })
  async update(@Param('id') id: string, @Body() body: UpdateTenantBodyDto) {
    const t = await this.service.update(id, body);
    return toDto(t);
  }
}
