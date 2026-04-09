import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { AppConfig } from '../../config/env.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: AppConfig) {}

  onModuleInit(): void {
    this.client = new IORedis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      maxRetriesPerRequest: null,
    });
    this.client.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  raw(): Redis {
    return this.client;
  }

  async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }
}
