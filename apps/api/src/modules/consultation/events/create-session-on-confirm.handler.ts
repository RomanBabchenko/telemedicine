import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { AppointmentConfirmedEvent } from '../../booking/events/appointment.events';
import { ConsultationService } from '../application/consultation.service';

@Injectable()
@EventsHandler(AppointmentConfirmedEvent)
export class CreateSessionOnConfirmHandler implements IEventHandler<AppointmentConfirmedEvent> {
  private readonly logger = new Logger(CreateSessionOnConfirmHandler.name);

  constructor(private readonly sessions: ConsultationService) {}

  async handle(event: AppointmentConfirmedEvent): Promise<void> {
    try {
      await this.sessions.ensureForAppointment(event.appointmentId);
      this.logger.log(`🎥 created consultation session for appointment ${event.appointmentId}`);
    } catch (e) {
      this.logger.error(`Failed to create session: ${(e as Error).message}`);
    }
  }
}
