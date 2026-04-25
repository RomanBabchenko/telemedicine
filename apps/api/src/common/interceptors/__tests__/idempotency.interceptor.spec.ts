import { ConflictException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { IDEMPOTENT_META } from '../../decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

type RedisMock = {
  get: jest.Mock;
  setEx: jest.Mock;
};

const makeRedis = (initial: Record<string, string> = {}): RedisMock => {
  const store: Record<string, string> = { ...initial };
  return {
    get: jest.fn(async (key: string) => store[key] ?? null),
    setEx: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };
};

const makeTenantCtx = (tenantId = 'tenant-1') => ({
  getTenantId: () => tenantId,
});

const makeContext = (req: Record<string, unknown>, resStatus = 201) => {
  const response = {
    statusCode: resStatus,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response,
    }),
    getHandler: () => () => undefined,
    getClass: () => class Foo {},
  } as unknown as ExecutionContext;
  return { ctx, response };
};

const makeReflector = (meta: Record<string, unknown> | undefined) => {
  const reflector = new Reflector();
  reflector.getAllAndOverride = jest.fn((key: unknown) => {
    if (key === IDEMPOTENT_META) return meta;
    return undefined;
  }) as unknown as Reflector['getAllAndOverride'];
  return reflector;
};

describe('IdempotencyInterceptor', () => {
  it('passes through when the endpoint is not @Idempotent()', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(
      makeReflector(undefined),
      redis as unknown as never,
      makeTenantCtx() as unknown as never,
    );
    const { ctx } = makeContext({ header: () => undefined, method: 'POST', path: '/x', body: {} });
    const next = { handle: () => of({ ok: true }) };
    const out = await firstValueFrom(interceptor.intercept(ctx, next));
    expect(out).toEqual({ ok: true });
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('passes through when Idempotency-Key header is absent', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(
      makeReflector({ ttlSeconds: 600 }),
      redis as unknown as never,
      makeTenantCtx() as unknown as never,
    );
    const { ctx } = makeContext({ header: () => undefined, method: 'POST', path: '/pay', body: {} });
    const next = { handle: () => of({ ok: true, id: 'p-1' }) };
    const out = await firstValueFrom(interceptor.intercept(ctx, next));
    expect(out).toEqual({ ok: true, id: 'p-1' });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  it('caches the result on first call and replays on second call', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(
      makeReflector({ ttlSeconds: 3600 }),
      redis as unknown as never,
      makeTenantCtx() as unknown as never,
    );
    const req = {
      header: (name: string) => (name === 'idempotency-key' ? 'abc-123' : undefined),
      method: 'POST',
      path: '/appointments/reserve',
      body: { slotId: 's-1' },
      user: { id: 'u-1' },
    };

    // First call — handler runs, result is cached.
    let calls = 0;
    const next1 = { handle: () => { calls += 1; return of({ id: 'a-1' }); } };
    const { ctx: ctx1 } = makeContext(req);
    const first = await firstValueFrom(interceptor.intercept(ctx1, next1));
    expect(first).toEqual({ id: 'a-1' });
    expect(calls).toBe(1);

    // Wait for the fire-and-forget setEx microtask to flush.
    await new Promise((r) => setImmediate(r));
    expect(redis.setEx).toHaveBeenCalledTimes(1);

    // Second call with the same key + body — handler is NOT invoked; cached result wins.
    const next2 = { handle: () => { calls += 1; return of({ id: 'should-not-appear' }); } };
    const { ctx: ctx2, response } = makeContext(req);
    const second = await firstValueFrom(interceptor.intercept(ctx2, next2));
    expect(second).toEqual({ id: 'a-1' });
    expect(calls).toBe(1);
    expect(response.statusCode).toBe(201);
  });

  it('rejects replays with a mismatched body as ConflictException', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(
      makeReflector({ ttlSeconds: 3600 }),
      redis as unknown as never,
      makeTenantCtx() as unknown as never,
    );
    const reqA = {
      header: (name: string) => (name === 'idempotency-key' ? 'abc-123' : undefined),
      method: 'POST',
      path: '/appointments/reserve',
      body: { slotId: 's-1' },
      user: { id: 'u-1' },
    };
    const { ctx: ctxA } = makeContext(reqA);
    await firstValueFrom(interceptor.intercept(ctxA, { handle: () => of({ id: 'a-1' }) }));
    await new Promise((r) => setImmediate(r));

    const reqB = { ...reqA, body: { slotId: 's-2' } };
    const { ctx: ctxB } = makeContext(reqB);
    await expect(
      firstValueFrom(interceptor.intercept(ctxB, { handle: () => of({ id: 'should-not-run' }) })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes cache keys by tenant + user + route', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(
      makeReflector({ ttlSeconds: 3600 }),
      redis as unknown as never,
      makeTenantCtx('t-1') as unknown as never,
    );
    const baseReq = {
      header: (name: string) => (name === 'idempotency-key' ? 'same-key' : undefined),
      method: 'POST',
      body: { slotId: 's-1' },
      user: { id: 'u-1' },
    };
    const { ctx: ctxA } = makeContext({ ...baseReq, path: '/route-a' });
    await firstValueFrom(interceptor.intercept(ctxA, { handle: () => of({ via: 'A' }) }));
    await new Promise((r) => setImmediate(r));

    // Different route ⇒ different cache key ⇒ handler runs again.
    const { ctx: ctxB } = makeContext({ ...baseReq, path: '/route-b' });
    let called = false;
    const next = { handle: () => { called = true; return of({ via: 'B' }); } };
    const out = await firstValueFrom(interceptor.intercept(ctxB, next));
    expect(called).toBe(true);
    expect(out).toEqual({ via: 'B' });
  });
});
