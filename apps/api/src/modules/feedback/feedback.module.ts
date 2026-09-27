import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentFeedback } from './domain/entities/appointment-feedback.entity';
import { ConsultationSession } from '../consultation/domain/entities/consultation-session.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { FeedbackService } from './application/feedback.service';
import { FeedbackController } from './api/feedback.controller';

// Post-consultation patient feedback. AppointmentService comes from the
// @Global BookingModule; BookingModule in turn reads AppointmentFeedback
// directly (list join + decoration) so there is no circular module import.
@Module({
  imports: [TypeOrmModule.forFeature([AppointmentFeedback, ConsultationSession, Patient])],
  providers: [FeedbackService],
  controllers: [FeedbackController],
  exports: [FeedbackService],
})
export class FeedbackModule {}
