import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './domain/entities/notification.entity';
import { NotificationPrefs } from './domain/entities/notification-prefs.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { User } from '../identity/domain/entities/user.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { NotificationService } from './application/notification.service';
import { TemplateRegistry } from './application/template.registry';
import { NotificationDispatcher } from './application/notification.dispatcher';
import { EmailChannel } from './infrastructure/channels/email.channel';
import { SmsChannel } from './infrastructure/channels/sms.channel';
import { InAppChannel } from './infrastructure/channels/in-app.channel';
import { NotificationController } from './api/notification.controller';
import { NOTIFICATION_EVENT_HANDLERS } from './events/listeners';

@Global()
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Notification, NotificationPrefs, Patient, User, Appointment, Doctor]),
  ],
  providers: [
    NotificationService,
    TemplateRegistry,
    NotificationDispatcher,
    EmailChannel,
    SmsChannel,
    InAppChannel,
    ...NOTIFICATION_EVENT_HANDLERS,
  ],
  controllers: [NotificationController],
  exports: [NotificationService, NotificationDispatcher],
})
export class NotificationModule {}
