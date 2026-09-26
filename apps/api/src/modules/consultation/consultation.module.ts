import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationSession } from './domain/entities/consultation-session.entity';
import { SessionEvent } from './domain/entities/session-event.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { RecordingModule } from '../recording/recording.module';
import { ConsultationService } from './application/consultation.service';
import { StaleConsultationSweeper } from './application/stale-consultation.sweeper';
import { RecordLeaveOnParticipantLeftHandler } from './events/record-leave-on-participant-left.handler';
import { ConsultationController } from './api/consultation.controller';
import { CreateSessionOnConfirmHandler } from './events/create-session-on-confirm.handler';
import { WaitingRoomGateway } from './api/waiting-room.gateway';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([ConsultationSession, SessionEvent, Appointment, Tenant]),
    RecordingModule,
  ],
  providers: [
    ConsultationService,
    CreateSessionOnConfirmHandler,
    WaitingRoomGateway,
    StaleConsultationSweeper,
    RecordLeaveOnParticipantLeftHandler,
  ],
  controllers: [ConsultationController],
  exports: [ConsultationService],
})
export class ConsultationModule {}
