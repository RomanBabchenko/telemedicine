import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalIdentity } from './domain/entities/external-identity.entity';
import { MisSyncJob } from './domain/entities/mis-sync-job.entity';
import { TenantIntegrationConfig } from './domain/entities/tenant-integration-config.entity';
import { ConsultationInvite } from './domain/entities/consultation-invite.entity';
import { IntegrationApiKey } from './domain/entities/integration-api-key.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { DoctorTenantProfile } from '../provider/domain/entities/doctor-tenant-profile.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { Slot } from '../booking/domain/entities/slot.entity';
import { ServiceType } from '../booking/domain/entities/service-type.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { User } from '../identity/domain/entities/user.entity';
import { UserTenantMembership } from '../identity/domain/entities/user-tenant-membership.entity';
import { ConsultationModule } from '../consultation/consultation.module';
import { RecordingModule } from '../recording/recording.module';
import { ConnectorRegistry } from './application/connector.registry';
import { SyncJobService } from './application/sync-job.service';
import { ConsultationInviteService } from './application/consultation-invite.service';
import { WebhookEventHandler } from './application/webhook-event.handler';
import { IntegrationApiKeyService } from './application/integration-api-key.service';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { DocDreamStubConnector } from './infrastructure/adapters/docdream-stub.connector';
import { MisController } from './api/mis.controller';
import { InviteController } from './api/invite.controller';
import { IntegrationKeysAdminController } from './api/integration-keys-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExternalIdentity,
      MisSyncJob,
      TenantIntegrationConfig,
      ConsultationInvite,
      IntegrationApiKey,
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
    RecordingModule,
  ],
  providers: [
    DocDreamStubConnector,
    ConnectorRegistry,
    SyncJobService,
    ConsultationInviteService,
    WebhookEventHandler,
    IntegrationApiKeyService,
    ApiKeyGuard,
  ],
  controllers: [MisController, InviteController, IntegrationKeysAdminController],
  exports: [ConnectorRegistry, SyncJobService, IntegrationApiKeyService],
})
export class MisIntegrationModule {}
