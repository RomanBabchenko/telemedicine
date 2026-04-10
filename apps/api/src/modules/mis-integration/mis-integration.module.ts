import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalIdentity } from './domain/entities/external-identity.entity';
import { MisSyncJob } from './domain/entities/mis-sync-job.entity';
import { TenantIntegrationConfig } from './domain/entities/tenant-integration-config.entity';
import { ConsultationInvite } from './domain/entities/consultation-invite.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { DoctorTenantProfile } from '../provider/domain/entities/doctor-tenant-profile.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { Slot } from '../booking/domain/entities/slot.entity';
import { ServiceType } from '../booking/domain/entities/service-type.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { User } from '../identity/domain/entities/user.entity';
import { UserTenantMembership } from '../identity/domain/entities/user-tenant-membership.entity';
import { ConsultationModule } from '../consultation/consultation.module';
import { ConnectorRegistry } from './application/connector.registry';
import { SyncJobService } from './application/sync-job.service';
import { ConsultationInviteService } from './application/consultation-invite.service';
import { WebhookEventHandler } from './application/webhook-event.handler';
import { DocDreamStubConnector } from './infrastructure/adapters/docdream-stub.connector';
import { MisController } from './api/mis.controller';
import { InviteController } from './api/invite.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExternalIdentity,
      MisSyncJob,
      TenantIntegrationConfig,
      ConsultationInvite,
      Doctor,
      DoctorTenantProfile,
      Patient,
      Slot,
      ServiceType,
      Appointment,
      User,
      UserTenantMembership,
    ]),
    ConsultationModule,
  ],
  providers: [
    DocDreamStubConnector,
    ConnectorRegistry,
    SyncJobService,
    ConsultationInviteService,
    WebhookEventHandler,
  ],
  controllers: [MisController, InviteController],
  exports: [ConnectorRegistry, SyncJobService],
})
export class MisIntegrationModule {}
