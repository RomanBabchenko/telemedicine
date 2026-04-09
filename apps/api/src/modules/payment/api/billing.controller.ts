import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import { Roles } from '../../../common/auth/decorators';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Auditable } from '../../../common/audit/decorators';
import { BillingService } from '../application/billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('tenant/:id/invoices')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE, Role.CLINIC_ADMIN)
  @Auditable({ action: 'billing.invoices.viewed', resource: 'Invoice' })
  invoices(@Param('id') tenantId: string) {
    return this.service.listInvoices(tenantId);
  }

  @Get('tenant/:id/ledger')
  @Roles(Role.PLATFORM_SUPER_ADMIN, Role.PLATFORM_FINANCE, Role.CLINIC_ADMIN)
  @Auditable({ action: 'billing.ledger.viewed', resource: 'LedgerEntry' })
  ledger(@Param('id') tenantId: string) {
    return this.service.listLedger(tenantId);
  }
}
