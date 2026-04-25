import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IDEMPOTENT_META, IdempotentOptions } from '../decorators/idempotent.decorator';

interface CachedRecord {
  /** HTTP status code the handler returned */
  statusCode: number;
  /** Hash of the original request body — prevents key reuse on different payloads */
  requestHash: string;
  /** JSON-serialised response body */
  body: unknown;
}

const hashBody = (body: unknown): string =>
  createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<IdempotentOptions | undefined>(
      IDEMPOTENT_META,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const rawKey = req.header('idempotency-key');
    if (!rawKey) {
      // Optional header — when absent we skip idempotency entirely, matching
      // the behaviour documented in the endpoint's description.
      return next.handle();
    }

    const cacheKey = this.buildCacheKey(req, rawKey);
    const requestHash = hashBody(req.body);

    return from(this.redis.get(cacheKey)).pipe(
      switchMap((existing): Observable<unknown> => {
        if (existing) {
          const record = this.parseRecord(existing);
          if (record) {
            if (record.requestHash !== requestHash) {
              // Same key + different payload = caller bug or replay attack.
              throw new ConflictException({
                message: 'Idempotency-Key reused with a different request body',
                code: 'idempotency.body_mismatch',
              });
            }
            http.getResponse().status(record.statusCode);
            return of(record.body);
          }
        }
        return next.handle().pipe(
          tap((body) => {
            const response = http.getResponse<{ statusCode?: number }>();
            const statusCode = response.statusCode ?? 200;
            const record: CachedRecord = { statusCode, requestHash, body };
            void this.redis
              .setEx(cacheKey, JSON.stringify(record), options.ttlSeconds ?? 86400)
              .catch((err) =>
                this.logger.warn(
                  `Failed to persist idempotency record ${cacheKey}: ${(err as Error).message}`,
                ),
              );
          }),
        );
      }),
    );
  }

  // Keying includes tenant + (optional) user + method + path. Without these a
  // malicious caller could replay a stranger's cached POST by guessing their
  // idempotency key.
  private buildCacheKey(req: Request, rawKey: string): string {
    const tenantId = this.safelyResolveTenant();
    const user = (req as Request & { user?: { id?: string | null } }).user;
    const userId = user?.id ?? 'anon';
    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
    return `idempotency:${tenantId}:${userId}:${route}:${hash}`;
  }

  private safelyResolveTenant(): string {
    try {
      return this.tenantContext.getTenantId();
    } catch {
      return 'global';
    }
  }

  private parseRecord(raw: string): CachedRecord | null {
    try {
      const parsed = JSON.parse(raw) as CachedRecord;
      if (
        typeof parsed.statusCode === 'number' &&
        typeof parsed.requestHash === 'string' &&
        'body' in parsed
      ) {
        return parsed;
      }
    } catch {
      // malformed record — fall through to re-execute
    }
    return null;
  }
}
