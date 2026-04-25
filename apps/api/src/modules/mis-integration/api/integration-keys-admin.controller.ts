import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { AuthUser, CurrentUser, Roles } from '../../../common/auth/decorators';
import { Auditable } from '../../../common/audit/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { TenantService } from '../../tenant/application/tenant.service';
import {
  CreatedIntegrationApiKey,
  IntegrationApiKeyService,
} from '../application/integration-api-key.service';
import { IntegrationApiKey } from '../domain/entities/integration-api-key.entity';
import {
  CreatedIntegrationKeyResponseDto,
  CreateIntegrationKeyBodyDto,
  IntegrationKeyResponseDto,
  IntegrationKeyRevokeResponseDto,
  ListIntegrationKeysQueryDto,
} from './dto';

const isPlatformActor = (roles: Role[]): boolean =>
  roles.includes(Role.PLATFORM_SUPER_ADMIN);

// IPv4: four octets 0-255. Loose — the server-side lib does real parsing
// when checking at request time.
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

const validateAllowlistEntry = (entry: string): string | null => {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) {
    const [ip, bitsStr] = trimmed.split('/');
    const bits = Number.parseInt(bitsStr ?? '', 10);
    if (!ip || !IPV4_RE.test(ip)) return null;
    if (!Number.isFinite(bits) || bits < 0 || bits > 32) return null;
    return `${ip}/${bits}`;
  }
  if (IPV4_RE.test(trimmed) || IPV6_RE.test(trimmed)) return trimmed;
  return null;
};

const toDto = (k: IntegrationApiKey): IntegrationKeyResponseDto => ({
  id: k.id,
  connectorId: k.connectorId,
  name: k.name,
  keyMasked: k.keyMasked,
  ipAllowlist: k.ipAllowlist,
  lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
  revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
  createdAt: k.createdAt.toISOString(),
});

const toCreatedDto = (k: CreatedIntegrationApiKey): CreatedIntegrationKeyResponseDto => ({
  id: k.id,
  rawKey: k.rawKey,
  connectorId: k.connectorId,
  name: k.name,
  keyMasked: k.keyMasked,
  ipAllowlist: k.ipAllowlist,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: k.createdAt.toISOString(),
});

@ApiTags('admin-integration-keys')
@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLINIC_ADMIN, Role.PLATFORM_SUPER_ADMIN)
@ApiAuth()
export class IntegrationKeysAdminController {
  constructor(
    private readonly keys: IntegrationApiKeyService,
    private readonly tenants: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private assertCanTouchTenant(actor: AuthUser, targetTenantId: string): void {
    if (isPlatformActor(actor.roles)) return;
    const ctxTenant = this.tenantContext.getTenantId();
    if (targetTenantId !== ctxTenant) {
      throw new ForbiddenException('CLINIC_ADMIN can only manage keys in own tenant');
    }
  }

  @Post(':tenantId/keys')
  @HttpCode(HttpStatus.CREATED)
  // Do NOT set captureBody — the response contains the raw key exactly once
  // and must never be persisted anywhere. The audit entry records only the
  // action + created-id.
  @Auditable({ action: 'integration.api-key.created', resource: 'IntegrationApiKey' })
  @ApiOperation({
    summary: 'Create an integration API key for a tenant+connector',
    description:
      'The raw key is returned exactly once in `rawKey` — store it on the caller side immediately. The server only persists a hash.',
    operationId: 'createIntegrationKey',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiBody({ type: CreateIntegrationKeyBodyDto })
  @ApiCreatedResponse({ type: CreatedIntegrationKeyResponseDto })
  @ApiStandardErrors()
  async create(
    @CurrentUser() actor: AuthUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() body: CreateIntegrationKeyBodyDto,
  ): Promise<CreatedIntegrationKeyResponseDto> {
    this.assertCanTouchTenant(actor, tenantId);
    await this.tenants.getOrThrow(tenantId);

    let allowlist: string[] | null = null;
    if (body.ipAllowlist && body.ipAllowlist.length > 0) {
      const valid: string[] = [];
      for (const raw of body.ipAllowlist) {
        const v = validateAllowlistEntry(raw);
        if (!v) {
          throw new BadRequestException(
            `Invalid IP/CIDR entry: "${raw}". Use formats like 10.0.0.5 or 10.0.0.0/24.`,
          );
        }
        valid.push(v);
      }
      allowlist = valid;
    }

    const created = await this.keys.create({
      tenantId,
      connectorId: body.connectorId,
      name: body.name ?? null,
      ipAllowlist: allowlist,
      createdBy: actor.id,
    });
    return toCreatedDto(created);
  }

  @Get(':tenantId/keys')
  @ApiOperation({
    summary: 'List integration API keys for a tenant',
    operationId: 'listIntegrationKeys',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiOkResponse({ type: [IntegrationKeyResponseDto] })
  @ApiStandardErrors()
  async list(
    @CurrentUser() actor: AuthUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Query() query: ListIntegrationKeysQueryDto,
  ): Promise<IntegrationKeyResponseDto[]> {
    this.assertCanTouchTenant(actor, tenantId);
    const rows = await this.keys.list(tenantId, query.connectorId);
    return rows.map(toDto);
  }

  @Post(':tenantId/keys/:keyId/revoke')
  @HttpCode(HttpStatus.OK)
  @Auditable({ action: 'integration.api-key.revoked', resource: 'IntegrationApiKey' })
  @ApiOperation({
    summary: 'Revoke an integration API key',
    operationId: 'revokeIntegrationKey',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'keyId', format: 'uuid' })
  @ApiOkResponse({ type: IntegrationKeyRevokeResponseDto })
  @ApiStandardErrors()
  async revoke(
    @CurrentUser() actor: AuthUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('keyId', new ParseUUIDPipe()) keyId: string,
  ): Promise<IntegrationKeyRevokeResponseDto> {
    this.assertCanTouchTenant(actor, tenantId);
    await this.keys.revoke(keyId, tenantId);
    return { ok: true };
  }
}
