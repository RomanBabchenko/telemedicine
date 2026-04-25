import { Notification } from '../../domain/entities/notification.entity';
import { NotificationPrefs } from '../../domain/entities/notification-prefs.entity';
import { NotificationResponseDto } from '../dto/notification.response.dto';
import { NotificationPrefsResponseDto } from '../dto/notification-prefs.response.dto';

export const toNotificationResponse = (n: Notification): NotificationResponseDto => ({
  id: n.id,
  channel: n.channel,
  templateCode: n.templateCode,
  subject: n.subject,
  body: n.body,
  status: n.status,
  sentAt: n.sentAt ? n.sentAt.toISOString() : null,
  createdAt: n.createdAt.toISOString(),
  payload: n.payload,
});

export const toNotificationPrefsResponse = (
  p: NotificationPrefs,
): NotificationPrefsResponseDto => ({
  email: p.email,
  sms: p.sms,
  push: p.push,
  marketing: p.marketing,
});
