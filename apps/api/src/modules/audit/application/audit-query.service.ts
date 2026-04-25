import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import {
  PaginatedResponseDto,
  buildPaginationMeta,
} from '../../../common/dto/pagination.dto';
import { AuditEvent } from '../domain/entities/audit-event.entity';
import { AuditEventResponseDto } from '../api/dto/audit-event.response.dto';
import { toAuditEventResponse } from '../api/mappers/audit.mapper';

export interface AuditQueryFilters {
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Query side of the audit log. Kept here (not in AuditLoggerService) because
 * the logger is write-only and runs on every request — mixing a read path in
 * would grow its surface for no gain.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(
    filters: AuditQueryFilters,
  ): Promise<PaginatedResponseDto<AuditEventResponseDto>> {
    const tenantId = this.tenantContext.getTenantId();
    const qb = this.events
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId OR e.tenant_id IS NULL', { tenantId })
      .orderBy('e.created_at', 'DESC');
    if (filters.resourceType) qb.andWhere('e.resource_type = :rt', { rt: filters.resourceType });
    if (filters.resourceId) qb.andWhere('e.resource_id = :rid', { rid: filters.resourceId });
    if (filters.actorUserId) qb.andWhere('e.actor_user_id = :aid', { aid: filters.actorUserId });
    if (filters.action) qb.andWhere('e.action = :action', { action: filters.action });

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const [rows, total] = await qb
      .take(pageSize)
      .skip((page - 1) * pageSize)
      .getManyAndCount();

    return {
      items: rows.map(toAuditEventResponse),
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }
}
