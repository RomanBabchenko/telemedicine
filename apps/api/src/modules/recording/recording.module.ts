import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionRecording } from './domain/entities/session-recording.entity';
import { RecordingEgress } from './domain/entities/recording-egress.entity';
import { ConsultationSession } from '../consultation/domain/entities/consultation-session.entity';
import { Consent } from '../patient/domain/entities/consent.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { RecordingService, RECORDING_MERGE_QUEUE } from './application/recording.service';
import { RecordingMergeProcessor } from './application/recording-merge.processor';
import { RetentionCleaner } from './application/retention.cleaner';
import { RecordingController } from './api/recording.controller';
import { LiveKitWebhookController } from './api/livekit-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionRecording,
      RecordingEgress,
      ConsultationSession,
      Consent,
      Tenant,
    ]),
    BullModule.registerQueue({ name: RECORDING_MERGE_QUEUE }),
  ],
  providers: [RecordingService, RetentionCleaner, RecordingMergeProcessor],
  controllers: [RecordingController, LiveKitWebhookController],
  exports: [RecordingService],
})
export class RecordingModule {}
