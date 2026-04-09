import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '@telemed/shared-types';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/decorators';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AuditEvent } from '../domain/entities/audit-event.entity';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(
    @InjectRepository(AuditEvent) private readonly repo: Repository<AuditEvent>,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('events')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.AUDITOR, Role.CLINIC_ADMIN)
  async list(
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const tenantId = this.tenantContext.getTenantId();
    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId OR e.tenant_id IS NULL', { tenantId })
      .orderBy('e.created_at', 'DESC');
    if (resourceType) qb.andWhere('e.resource_type = :resourceType', { resourceType });
    if (resourceId) qb.andWhere('e.resource_id = :resourceId', { resourceId });
    if (actorUserId) qb.andWhere('e.actor_user_id = :actorUserId', { actorUserId });
    if (action) qb.andWhere('e.action = :action', { action });

    const ps = Number.parseInt(pageSize, 10);
    const p = Number.parseInt(page, 10);
    const [items, total] = await qb
      .take(ps)
      .skip((p - 1) * ps)
      .getManyAndCount();

    return { items, total, page: p, pageSize: ps };
  }
}
