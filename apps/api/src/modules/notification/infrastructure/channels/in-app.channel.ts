import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationStatus } from '@telemed/shared-types';
import { Notification } from '../../domain/entities/notification.entity';

@Injectable()
export class InAppChannel {
  readonly id = 'IN_APP';
  constructor(@InjectRepository(Notification) private readonly repo: Repository<Notification>) {}

  async send(notification: Notification): Promise<void> {
    notification.status = NotificationStatus.SENT;
    notification.sentAt = new Date();
    await this.repo.save(notification);
  }
}
