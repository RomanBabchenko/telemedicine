import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@telemed/shared-types';
import { Public, Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { SyncJobService } from '../application/sync-job.service';
import { ConnectorRegistry } from '../application/connector.registry';

@ApiTags('mis-integration')
@Controller('integrations')
export class MisController {
  constructor(
    private readonly sync: SyncJobService,
    private readonly registry: ConnectorRegistry,
  ) {}

  @ApiBearerAuth()
  @Post(':tenantId/sync/full')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'mis.sync.full', resource: 'MisSyncJob' })
  async fullSync(@Param('tenantId') tenantId: string) {
    const job = await this.sync.runFullSync(tenantId);
    return { ok: true, jobId: job.id, stats: job.stats, status: job.status };
  }

  @ApiBearerAuth()
  @Post(':tenantId/sync/incremental')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  @Auditable({ action: 'mis.sync.incremental', resource: 'MisSyncJob' })
  async incrementalSync(@Param('tenantId') tenantId: string) {
    const job = await this.sync.runIncrementalSync(tenantId);
    return { ok: true, jobId: job.id, stats: job.stats, status: job.status };
  }

  @ApiBearerAuth()
  @Get(':tenantId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  status(@Param('tenantId') tenantId: string) {
    return this.sync.status(tenantId);
  }

  @ApiBearerAuth()
  @Get(':tenantId/errors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
  errors(@Param('tenantId') tenantId: string) {
    return this.sync.listErrors(tenantId);
  }

  @Post(':tenantId/webhook/:connector')
  @Public()
  @Auditable({ action: 'mis.webhook.received', resource: 'MisSyncJob' })
  async webhook(
    @Param('tenantId') _tenantId: string,
    @Param('connector') connectorId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const connector = this.registry.get(connectorId);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v;
    }
    if (!connector.verifyWebhookSignature(headers, JSON.stringify(body))) {
      return { received: false };
    }
    const event = connector.parseWebhookEvent(JSON.stringify(body));
    return { received: true, event };
  }
}
