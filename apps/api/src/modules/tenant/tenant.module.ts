import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './domain/entities/tenant.entity';
import { TenantBillingPlan } from './domain/entities/tenant-billing-plan.entity';
import { RevenueShareRule } from './domain/entities/revenue-share-rule.entity';
import { TenantService } from './application/tenant.service';
import { TenantController } from './api/tenant.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantBillingPlan, RevenueShareRule]),
  ],
  providers: [TenantService],
  controllers: [TenantController],
  exports: [TenantService],
})
export class TenantModule {}
