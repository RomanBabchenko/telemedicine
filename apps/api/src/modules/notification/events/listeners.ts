import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AppointmentConfirmedEvent,
  AppointmentReservedEvent,
} from '../../booking/events/appointment.events';
import { PaymentSucceededEvent } from '../../payment/events/payment.events';
import { DocumentSignedEvent } from '../../documentation/events/document.events';
import { NotificationDispatcher } from '../application/notification.dispatcher';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { Doctor } from '../../provider/domain/entities/doctor.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';

async function patientUserId(
  patients: Repository<Patient>,
  patientId: string | null,
): Promise<string | null> {
  if (!patientId) return null;
  const p = await patients.findOne({ where: { id: patientId } });
  return p?.userId ?? null;
}

@Injectable()
@EventsHandler(AppointmentConfirmedEvent)
export class OnAppointmentConfirmed implements IEventHandler<AppointmentConfirmedEvent> {
  private readonly logger = new Logger(OnAppointmentConfirmed.name);
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  async handle(event: AppointmentConfirmedEvent): Promise<void> {
    const userId = await patientUserId(this.patients, event.patientId);
    const appt = await this.appointments.findOne({ where: { id: event.appointmentId } });
    const doctor = await this.doctors.findOne({ where: { id: event.doctorId } });
    await this.dispatcher.dispatch({
      tenantId: event.tenantId,
      userId,
      templateCode: 'booking.confirmed',
      vars: {
        startAt: appt?.startAt?.toISOString() ?? '',
        doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : '',
      },
    });
  }
}

@Injectable()
@EventsHandler(AppointmentReservedEvent)
export class OnAppointmentReserved implements IEventHandler<AppointmentReservedEvent> {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async handle(event: AppointmentReservedEvent): Promise<void> {
    const userId = await patientUserId(this.patients, event.patientId);
    if (!userId) return;
    await this.dispatcher.dispatch({
      tenantId: event.tenantId,
      userId,
      templateCode: 'reminder.upcoming',
      vars: { doctorName: 'Лікар', startAt: 'найближчим часом' },
    });
  }
}

@Injectable()
@EventsHandler(PaymentSucceededEvent)
export class OnPaymentSucceeded implements IEventHandler<PaymentSucceededEvent> {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async handle(event: PaymentSucceededEvent): Promise<void> {
    const appt = await this.appointments.findOne({ where: { id: event.appointmentId } });
    if (!appt) return;
    const userId = await patientUserId(this.patients, appt.patientId);
    await this.dispatcher.dispatch({
      tenantId: event.tenantId,
      userId,
      templateCode: 'payment.succeeded',
      vars: { amount: event.amount, currency: 'UAH' },
    });
  }
}

@Injectable()
@EventsHandler(DocumentSignedEvent)
export class OnDocumentSigned implements IEventHandler<DocumentSignedEvent> {
  constructor(
    private readonly dispatcher: NotificationDispatcher,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async handle(event: DocumentSignedEvent): Promise<void> {
    const userId = await patientUserId(this.patients, event.patientId);
    await this.dispatcher.dispatch({
      tenantId: event.tenantId,
      userId,
      templateCode: 'document.ready',
      vars: { documentType: event.type.toLowerCase() },
    });
  }
}

/**
 * Convenience array — register every handler in NotificationModule providers.
 * Each `@EventsHandler` class must be in the DI container so @nestjs/cqrs
 * can subscribe it to its event type.
 */
export const NOTIFICATION_EVENT_HANDLERS = [
  OnAppointmentConfirmed,
  OnAppointmentReserved,
  OnPaymentSucceeded,
  OnDocumentSigned,
];
