import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../../common/auth/decorators';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { MinioService } from '../../infrastructure/minio/minio.service';
import { HealthResponseDto } from './dto/health.response.dto';

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
  @ApiOperation({
    summary: 'Liveness / readiness probe',
    description:
      "Pings Postgres, Redis and MinIO. Returns status='ok' when every dependency is reachable, 'degraded' otherwise. Used by Kubernetes / uptime checks.",
    operationId: 'healthCheck',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  async check(): Promise<HealthResponseDto> {
    const result: HealthResponseDto = {
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      minio: 'ok',
    };

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      result.db = 'fail';
      result.status = 'degraded';
    }

    try {
      await this.redis.raw().ping();
    } catch {
      result.redis = 'fail';
      result.status = 'degraded';
    }

    try {
      await this.minio.raw().listBuckets();
    } catch {
      result.minio = 'fail';
      result.status = 'degraded';
    }

    return result;
  }
}
