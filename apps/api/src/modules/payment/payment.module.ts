import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/env.config';
import { Payment } from './domain/entities/payment.entity';
import { LedgerEntry } from './domain/entities/ledger-entry.entity';
import { Payout } from './domain/entities/payout.entity';
import { Invoice } from './domain/entities/invoice.entity';
import { RevenueShareRule } from '../tenant/domain/entities/revenue-share-rule.entity';
import { TenantBillingPlan } from '../tenant/domain/entities/tenant-billing-plan.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { ServiceType } from '../booking/domain/entities/service-type.entity';
import { PaymentService } from './application/payment.service';
import { LedgerService } from './application/ledger.service';
import { BillingService } from './application/billing.service';
import { StubPaymentProvider } from './infrastructure/adapters/stub-payment.provider';
import { PaymentController } from './api/payment.controller';
import { BillingController } from './api/billing.controller';
import { PAYMENT_PROVIDER } from './domain/ports/payment-provider';
import { ConfirmOnPaymentSucceededHandler } from './events/confirm-on-payment-succeeded.handler';

@Global()
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      Payment,
      LedgerEntry,
      Payout,
      Invoice,
      RevenueShareRule,
      TenantBillingPlan,
      Tenant,
      ServiceType,
    ]),
  ],
  providers: [
    PaymentService,
    LedgerService,
    BillingService,
    StubPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (config: AppConfig, stub: StubPaymentProvider) => {
        // Only the stub provider is wired for MVP. Others are added by replacing this factory.
        if (config.paymentProvider !== 'stub') {
          // eslint-disable-next-line no-console
          console.warn(
            `[payment] PAYMENT_PROVIDER=${config.paymentProvider} not implemented yet, falling back to stub`,
          );
        }
        return stub;
      },
      inject: [AppConfig, StubPaymentProvider],
    },
    ConfirmOnPaymentSucceededHandler,
  ],
  controllers: [PaymentController, BillingController],
  exports: [PaymentService, LedgerService, BillingService],
})
export class PaymentModule {}
