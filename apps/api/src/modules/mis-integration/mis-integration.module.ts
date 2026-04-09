import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalIdentity } from './domain/entities/external-identity.entity';
import { MisSyncJob } from './domain/entities/mis-sync-job.entity';
import { TenantIntegrationConfig } from './domain/entities/tenant-integration-config.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { Slot } from '../booking/domain/entities/slot.entity';
import { ServiceType } from '../booking/domain/entities/service-type.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { ConnectorRegistry } from './application/connector.registry';
import { SyncJobService } from './application/sync-job.service';
import { DocDreamStubConnector } from './infrastructure/adapters/docdream-stub.connector';
import { MisController } from './api/mis.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExternalIdentity,
      MisSyncJob,
      TenantIntegrationConfig,
      Doctor,
      Patient,
      Slot,
      ServiceType,
      Appointment,
    ]),
  ],
  providers: [DocDreamStubConnector, ConnectorRegistry, SyncJobService],
  controllers: [MisController],
  exports: [ConnectorRegistry, SyncJobService],
})
export class MisIntegrationModule {}
