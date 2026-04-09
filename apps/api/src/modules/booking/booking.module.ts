import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Slot } from './domain/entities/slot.entity';
import { Appointment } from './domain/entities/appointment.entity';
import { ServiceType } from './domain/entities/service-type.entity';
import { AvailabilityRule } from './domain/entities/availability-rule.entity';
import { AppointmentParticipant } from './domain/entities/appointment-participant.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { AvailabilityService } from './application/availability.service';
import { AppointmentService } from './application/appointment.service';
import { SlotHoldService } from './application/slot-hold.service';
import { APPOINTMENT_EVENT_HANDLERS } from './events/appointment.listeners';
import { ExpiredHoldsCleaner } from './events/expired-holds.cleaner';
import { BookingController } from './api/booking.controller';

@Global()
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      Slot,
      Appointment,
      ServiceType,
      AvailabilityRule,
      AppointmentParticipant,
      Patient,
    ]),
  ],
  providers: [
    AvailabilityService,
    AppointmentService,
    SlotHoldService,
    ...APPOINTMENT_EVENT_HANDLERS,
    ExpiredHoldsCleaner,
  ],
  controllers: [BookingController],
  exports: [AppointmentService, AvailabilityService],
})
export class BookingModule {}
