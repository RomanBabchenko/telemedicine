import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from './domain/entities/doctor.entity';
import { DoctorTenantProfile } from './domain/entities/doctor-tenant-profile.entity';
import { AvailabilityRule } from '../booking/domain/entities/availability-rule.entity';
import { User } from '../identity/domain/entities/user.entity';
import { UserTenantMembership } from '../identity/domain/entities/user-tenant-membership.entity';
import { ProviderService } from './application/provider.service';
import { ProviderController } from './api/provider.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Doctor,
      DoctorTenantProfile,
      AvailabilityRule,
      User,
      UserTenantMembership,
    ]),
  ],
  providers: [ProviderService],
  controllers: [ProviderController],
  exports: [ProviderService],
})
export class ProviderModule {}
