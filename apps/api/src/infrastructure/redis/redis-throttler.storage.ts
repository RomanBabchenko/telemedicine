import IORedis, { Redis } from 'ioredis';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

// Redis-backed throttler storage so rate limits stay global when the API
// runs on more than one instance (the default in-memory storage would
// multiply every limit by the instance count — including the tight
// brute-force limits on login/OTP).
//
// Uses its own lazy connection: the storage is constructed inside
// ThrottlerModule.forRoot at import time, before Nest lifecycle hooks run,
// so it can't borrow RedisService's client.
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Redis;

  constructor(host: string, port: number) {
    this.redis = new IORedis({ host, port, lazyConnect: true, maxRetriesPerRequest: null });
  }

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${key}`;
    const multi = this.redis.multi();
    multi.incr(redisKey);
    multi.pttl(redisKey);
    const [[, hits], [, ttlMs]] = (await multi.exec()) as [[null, number], [null, number]];
    let timeToExpire = ttlMs;
    if (ttlMs < 0) {
      // Fresh key — set the window.
      await this.redis.pexpire(redisKey, ttl);
      timeToExpire = ttl;
    }
    return { totalHits: hits, timeToExpire: Math.ceil(timeToExpire / 1000) };
  }
}
