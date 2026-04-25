import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { AuditQueryService } from '../application/audit-query.service';
import { AuditEventsPageResponseDto, ListAuditEventsQueryDto } from './dto';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class AuditController {
  constructor(private readonly query: AuditQueryService) {}

  @Get('events')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.AUDITOR, Role.CLINIC_ADMIN)
  @ApiOperation({
    summary: 'Query the audit event log',
    description:
      "Tenant-scoped by default (tenant_id matches OR is NULL for platform-wide events). Ordered newest-first. Accepts filters on resource type/id, actor, and action.",
    operationId: 'listAuditEvents',
  })
  @ApiOkResponse({ type: AuditEventsPageResponseDto })
  @ApiStandardErrors()
  list(@Query() filters: ListAuditEventsQueryDto): Promise<AuditEventsPageResponseDto> {
    return this.query.list(filters);
  }
}
