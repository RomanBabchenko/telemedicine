import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionRecording } from './domain/entities/session-recording.entity';
import { ConsultationSession } from '../consultation/domain/entities/consultation-session.entity';
import { Consent } from '../patient/domain/entities/consent.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { RecordingService } from './application/recording.service';
import { RetentionCleaner } from './application/retention.cleaner';
import { RecordingController } from './api/recording.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionRecording, ConsultationSession, Consent, Tenant]),
  ],
  providers: [RecordingService, RetentionCleaner],
  controllers: [RecordingController],
  exports: [RecordingService],
})
export class RecordingModule {}
