import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { MinioService } from '../../infrastructure/minio/minio.service';
import { Public } from '../../common/auth/decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly minio: MinioService,
  ) {}

  @Get()
  @Public()
  async check() {
    const result: Record<string, string> = { status: 'ok' };

    try {
      await this.dataSource.query('SELECT 1');
      result.db = 'ok';
    } catch (e) {
      result.db = 'fail';
      result.status = 'degraded';
    }

    try {
      await this.redis.raw().ping();
      result.redis = 'ok';
    } catch {
      result.redis = 'fail';
      result.status = 'degraded';
    }

    try {
      await this.minio.raw().listBuckets();
      result.minio = 'ok';
    } catch {
      result.minio = 'fail';
      result.status = 'degraded';
    }

    return result;
  }
}
