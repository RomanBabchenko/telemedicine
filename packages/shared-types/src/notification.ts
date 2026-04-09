import { NotificationChannel, NotificationStatus } from './enums';

export interface NotificationDto {
  id: string;
  channel: NotificationChannel;
  templateCode: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  sentAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface NotificationPrefsDto {
  email: boolean;
  sms: boolean;
  push: boolean;
  marketing: boolean;
}
