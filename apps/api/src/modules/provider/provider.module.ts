import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor } from './domain/entities/doctor.entity';
import { DoctorTenantProfile } from './domain/entities/doctor-tenant-profile.entity';
import { AvailabilityRule } from '../booking/domain/entities/availability-rule.entity';
import { ProviderService } from './application/provider.service';
import { ProviderController } from './api/provider.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Doctor, DoctorTenantProfile, AvailabilityRule])],
  providers: [ProviderService],
  controllers: [ProviderController],
  exports: [ProviderService],
})
export class ProviderModule {}
