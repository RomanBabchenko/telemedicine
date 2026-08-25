import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
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
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { BillingService } from '../application/billing.service';
import { InvoiceResponseDto, LedgerEntryResponseDto } from './dto';
import { toInvoiceResponse, toLedgerEntryResponse } from './mappers/payment.mapper';

// Clinic-level roles may only read their own tenant's billing.
const PLATFORM_WIDE_ROLES: readonly Role[] = [Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE];
const assertOwnTenant = (user: AuthUser, tenantId: string): void => {
  if (user.roles.some((r) => PLATFORM_WIDE_ROLES.includes(r))) return;
  if (user.tenantId !== tenantId) {
    throw new ForbiddenException('You may only access your own tenant');
  }
};

@ApiTags('billing')
@Controller('billing')
@UseGuards(RolesGuard)
@ApiAuth()
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('tenant/:id/invoices')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE, Role.CLINIC_ADMIN, Role.INTEGRATION_ADMIN)
  @Auditable({ action: 'billing.invoices.viewed', resource: 'Invoice' })
  @ApiOperation({
    summary: "List a tenant's invoices",
    operationId: 'listTenantInvoices',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Tenant id' })
  @ApiOkResponse({ type: [InvoiceResponseDto] })
  @ApiStandardErrors()
  async invoices(
    @Param('id', new ParseUUIDPipe()) tenantId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<InvoiceResponseDto[]> {
    assertOwnTenant(user, tenantId);
    const invoices = await this.service.listInvoices(tenantId);
    return invoices.map(toInvoiceResponse);
  }

  @Get('tenant/:id/ledger')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE, Role.CLINIC_ADMIN, Role.INTEGRATION_ADMIN)
  @Auditable({ action: 'billing.ledger.viewed', resource: 'LedgerEntry' })
  @ApiOperation({
    summary: "List a tenant's ledger entries (last 200, newest first)",
    operationId: 'listTenantLedger',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Tenant id' })
  @ApiOkResponse({ type: [LedgerEntryResponseDto] })
  @ApiStandardErrors()
  async ledger(
    @Param('id', new ParseUUIDPipe()) tenantId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LedgerEntryResponseDto[]> {
    assertOwnTenant(user, tenantId);
    const entries = await this.service.listLedger(tenantId);
    return entries.map(toLedgerEntryResponse);
  }
}
