import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  tenantSlug?: string;
  features?: Record<string, boolean>;
  allowCrossTenant?: boolean;
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  run<T>(ctx: TenantContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  get(): TenantContext | undefined {
    return this.als.getStore();
  }

  getRequired(): TenantContext {
    const ctx = this.get();
    if (!ctx) {
      throw new Error('Tenant context is not initialized for this request');
    }
    return ctx;
  }

  getTenantId(): string {
    return this.getRequired().tenantId;
  }

  getActorUserId(): string | null {
    return this.get()?.actorUserId ?? null;
  }

  setActor(userId: string): void {
    const ctx = this.get();
    if (ctx) {
      ctx.actorUserId = userId;
    }
  }

  isCrossTenantAllowed(): boolean {
    return this.get()?.allowCrossTenant === true;
  }
}
