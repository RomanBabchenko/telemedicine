import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { AppointmentService } from '../../booking/application/appointment.service';
import { PaymentSucceededEvent } from './payment.events';

@Injectable()
@EventsHandler(PaymentSucceededEvent)
export class ConfirmOnPaymentSucceededHandler implements IEventHandler<PaymentSucceededEvent> {
  private readonly logger = new Logger(ConfirmOnPaymentSucceededHandler.name);

  constructor(private readonly appointments: AppointmentService) {}

  async handle(event: PaymentSucceededEvent): Promise<void> {
    try {
      await this.appointments.confirm(event.appointmentId);
      this.logger.log(`✅ confirmed appointment ${event.appointmentId} after payment`);
    } catch (e) {
      this.logger.warn(
        `Could not auto-confirm appointment ${event.appointmentId}: ${(e as Error).message}`,
      );
    }
  }
}
