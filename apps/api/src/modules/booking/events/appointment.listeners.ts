import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { AppointmentReservedEvent, AppointmentConfirmedEvent } from './appointment.events';

@Injectable()
@EventsHandler(AppointmentReservedEvent)
export class AppointmentReservedLogger implements IEventHandler<AppointmentReservedEvent> {
  private readonly logger = new Logger(AppointmentReservedLogger.name);
  handle(event: AppointmentReservedEvent): void {
    this.logger.log(`📅 appointment.reserved ${event.appointmentId}`);
  }
}

@Injectable()
@EventsHandler(AppointmentConfirmedEvent)
export class AppointmentConfirmedLogger implements IEventHandler<AppointmentConfirmedEvent> {
  private readonly logger = new Logger(AppointmentConfirmedLogger.name);
  handle(event: AppointmentConfirmedEvent): void {
    this.logger.log(`✅ appointment.confirmed ${event.appointmentId}`);
  }
}

/**
 * Convenience array — register every handler in BookingModule providers.
 * Each `@EventsHandler` class must be in the DI container so @nestjs/cqrs
 * can subscribe it to its event type.
 */
export const APPOINTMENT_EVENT_HANDLERS = [
  AppointmentReservedLogger,
  AppointmentConfirmedLogger,
];
