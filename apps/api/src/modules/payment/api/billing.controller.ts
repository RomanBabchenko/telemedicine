import {
  Controller,
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
import { Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { ApiAuth, ApiStandardErrors } from '../../../common/swagger';
import { BillingService } from '../application/billing.service';
import { InvoiceResponseDto, LedgerEntryResponseDto } from './dto';
import { toInvoiceResponse, toLedgerEntryResponse } from './mappers/payment.mapper';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiAuth()
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('tenant/:id/invoices')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE, Role.CLINIC_ADMIN)
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
  ): Promise<InvoiceResponseDto[]> {
    const invoices = await this.service.listInvoices(tenantId);
    return invoices.map(toInvoiceResponse);
  }

  @Get('tenant/:id/ledger')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE, Role.CLINIC_ADMIN)
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
  ): Promise<LedgerEntryResponseDto[]> {
    const entries = await this.service.listLedger(tenantId);
    return entries.map(toLedgerEntryResponse);
  }
}
