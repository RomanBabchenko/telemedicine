import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SlotStatus } from '@telemed/shared-types';
import { Slot } from '../domain/entities/slot.entity';
import { RedisService } from '../../../infrastructure/redis/redis.service';

@Injectable()
export class ExpiredHoldsCleaner {
  private readonly logger = new Logger(ExpiredHoldsCleaner.name);

  constructor(
    @InjectRepository(Slot) private readonly slots: Repository<Slot>,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async release(): Promise<void> {
    // Distributed lock: with N API instances the cron fires N times per
    // tick — the UPDATE is idempotent, but only one instance needs to run it.
    if (!(await this.redis.setNxEx('cron-lock:expired-holds', '1', 55))) return;
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
