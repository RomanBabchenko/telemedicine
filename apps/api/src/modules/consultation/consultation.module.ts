import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationSession } from './domain/entities/consultation-session.entity';
import { SessionEvent } from './domain/entities/session-event.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { ConsultationService } from './application/consultation.service';
import { ConsultationController } from './api/consultation.controller';
import { CreateSessionOnConfirmHandler } from './events/create-session-on-confirm.handler';
import { WaitingRoomGateway } from './api/waiting-room.gateway';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([ConsultationSession, SessionEvent, Appointment]),
  ],
  providers: [ConsultationService, CreateSessionOnConfirmHandler, WaitingRoomGateway],
  controllers: [ConsultationController],
  exports: [ConsultationService],
})
export class ConsultationModule {}
