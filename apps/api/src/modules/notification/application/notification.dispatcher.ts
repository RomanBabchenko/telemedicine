import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationStatus } from '@telemed/shared-types';
import { Notification } from '../domain/entities/notification.entity';
import { NotificationPrefs } from '../domain/entities/notification-prefs.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { User } from '../../identity/domain/entities/user.entity';
import { TemplateRegistry } from './template.registry';
import { EmailChannel } from '../infrastructure/channels/email.channel';
import { SmsChannel } from '../infrastructure/channels/sms.channel';
import { InAppChannel } from '../infrastructure/channels/in-app.channel';

export interface DispatchInput {
  tenantId: string;
  userId: string | null;
  templateCode: string;
  vars?: Record<string, string | number | null>;
  channels?: NotificationChannel[];
  locale?: string;
}

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPrefs) private readonly prefs: Repository<NotificationPrefs>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly templates: TemplateRegistry,
    private readonly email: EmailChannel,
    private readonly sms: SmsChannel,
    private readonly inApp: InAppChannel,
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    const channels: NotificationChannel[] =
      input.channels ?? [NotificationChannel.IN_APP, NotificationChannel.EMAIL];

    let user: User | null = null;
    if (input.userId) user = await this.users.findOne({ where: { id: input.userId } });

    const prefs = input.userId
      ? await this.prefs.findOne({ where: { userId: input.userId } })
      : null;

    for (const ch of channels) {
      if (prefs) {
        if (ch === NotificationChannel.EMAIL && !prefs.email) continue;
        if (ch === NotificationChannel.SMS && !prefs.sms) continue;
        if (ch === NotificationChannel.PUSH && !prefs.push) continue;
      }
      const tpl = this.templates.render(
        input.templateCode,
        input.locale ?? 'uk',
        input.vars ?? {},
      );
      const notification = this.notifications.create({
        tenantId: input.tenantId,
        userId: input.userId,
        channel: ch,
        templateCode: input.templateCode,
        subject: tpl.subject,
        body: tpl.body,
        payload: input.vars ?? {},
        status: NotificationStatus.QUEUED,
      });
      await this.notifications.save(notification);

      try {
        if (ch === NotificationChannel.EMAIL && user?.email) {
          await this.email.send({ to: user.email, subject: tpl.subject, body: tpl.body });
          notification.status = NotificationStatus.SENT;
          notification.sentAt = new Date();
          await this.notifications.save(notification);
        } else if (ch === NotificationChannel.SMS && user?.phone) {
          await this.sms.send({ to: user.phone, body: tpl.body });
          notification.status = NotificationStatus.SENT;
          notification.sentAt = new Date();
          await this.notifications.save(notification);
        } else if (ch === NotificationChannel.IN_APP) {
          await this.inApp.send(notification);
        }
      } catch (e) {
        notification.status = NotificationStatus.FAILED;
        notification.error = (e as Error).message;
        await this.notifications.save(notification);
        this.logger.warn(`Notification ${ch} failed: ${(e as Error).message}`);
      }
    }
  }
}
