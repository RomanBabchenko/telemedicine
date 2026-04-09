import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SlotStatus } from '@telemed/shared-types';
import { Slot } from '../domain/entities/slot.entity';

@Injectable()
export class ExpiredHoldsCleaner {
  private readonly logger = new Logger(ExpiredHoldsCleaner.name);

  constructor(@InjectRepository(Slot) private readonly slots: Repository<Slot>) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async release(): Promise<void> {
    const now = new Date();
    const result = await this.slots
      .createQueryBuilder()
      .update(Slot)
      .set({ status: SlotStatus.OPEN, heldUntil: null })
      .where('status = :status', { status: SlotStatus.HELD })
      .andWhere('held_until IS NOT NULL AND held_until < :now', { now })
      .execute();
    if (result.affected && result.affected > 0) {
      this.logger.log(`🔓 Released ${result.affected} expired slot holds`);
    }
  }
}
