import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service';

const HOLD_TTL_SECONDS = 600; // 10 minutes

@Injectable()
export class SlotHoldService {
  constructor(private readonly redis: RedisService) {}

  private key(slotId: string): string {
    return `slot-hold:${slotId}`;
  }

  /**
   * Atomically acquire a hold on the slot. Returns true if we won the race,
   * false if another reservation already holds it.
   */
  async tryHold(slotId: string, ownerId: string): Promise<boolean> {
    return this.redis.setNxEx(this.key(slotId), ownerId, HOLD_TTL_SECONDS);
  }

  async release(slotId: string): Promise<void> {
    await this.redis.del(this.key(slotId));
  }

  async getHolder(slotId: string): Promise<string | null> {
    return this.redis.get(this.key(slotId));
  }
}
