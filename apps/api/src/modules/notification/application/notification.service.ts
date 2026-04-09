import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationStatus } from '@telemed/shared-types';
import { Notification } from '../domain/entities/notification.entity';
import { NotificationPrefs } from '../domain/entities/notification-prefs.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPrefs) private readonly prefs: Repository<NotificationPrefs>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async listForUser(userId: string): Promise<Notification[]> {
    const tenantId = this.tenantContext.getTenantId();
    return this.notifications.find({
      where: { tenantId, userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async markRead(id: string): Promise<void> {
    await this.notifications.update({ id }, { status: NotificationStatus.READ });
  }

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    let prefs = await this.prefs.findOne({ where: { userId } });
    if (!prefs) {
      prefs = this.prefs.create({ userId });
      prefs = await this.prefs.save(prefs);
    }
    return prefs;
  }

  async updatePrefs(
    userId: string,
    input: { email?: boolean; sms?: boolean; push?: boolean; marketing?: boolean },
  ): Promise<NotificationPrefs> {
    const prefs = await this.getPrefs(userId);
    if (input.email !== undefined) prefs.email = input.email;
    if (input.sms !== undefined) prefs.sms = input.sms;
    if (input.push !== undefined) prefs.push = input.push;
    if (input.marketing !== undefined) prefs.marketing = input.marketing;
    return this.prefs.save(prefs);
  }
}
