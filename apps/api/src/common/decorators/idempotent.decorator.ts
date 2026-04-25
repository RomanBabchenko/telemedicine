import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_META = 'idempotent';

export interface IdempotentOptions {
  /** Cache lifetime for the idempotency record (seconds). Default: 86400 (24h). */
  ttlSeconds?: number;
}

/**
 * Mark an endpoint as idempotent — replays of the same `Idempotency-Key`
 * header return the cached response instead of re-executing the handler.
 *
 * Header is optional. Callers that don't supply `Idempotency-Key` bypass the
 * interceptor entirely (behaviour is unchanged). Callers that DO supply one
 * get at-most-once semantics for the lifetime of the cached record.
 */
export const Idempotent = (options: IdempotentOptions = {}) =>
  SetMetadata(IDEMPOTENT_META, { ttlSeconds: options.ttlSeconds ?? 86400 });
