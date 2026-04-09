import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { AuditLoggerService } from '../../modules/audit/application/audit-logger.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  AUDITABLE_KEY,
  AUDIT_VIEW_KEY,
  AuditableOptions,
} from './decorators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogger: AuditLoggerService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditable = this.reflector.getAllAndOverride<AuditableOptions>(AUDITABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const auditView = this.reflector.getAllAndOverride<{ resource: string }>(
      AUDIT_VIEW_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditable && !auditView) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const ctx = this.tenantContext.get();

    return next.handle().pipe(
      tap((result) => {
        try {
          if (auditable) {
            const resourceId =
              (result && typeof result === 'object' && 'id' in result
                ? (result as { id: string }).id
                : (req.params?.id as string | undefined)) ?? null;
            this.auditLogger.recordAsync({
              actorUserId: ctx?.actorUserId ?? null,
              tenantId: ctx?.tenantId ?? null,
              action: auditable.action,
              resourceType: auditable.resource,
              resourceId,
              ip: ctx?.ip ?? null,
              userAgent: ctx?.userAgent ?? null,
              after:
                auditable.captureBody && result
                  ? (result as Record<string, unknown>)
                  : null,
              before: null,
            });
          }
          if (auditView) {
            const resourceId =
              (req.params?.id as string | undefined) ?? null;
            this.auditLogger.recordAsync({
              actorUserId: ctx?.actorUserId ?? null,
              tenantId: ctx?.tenantId ?? null,
              action: `${auditView.resource}.viewed`,
              resourceType: auditView.resource,
              resourceId,
              ip: ctx?.ip ?? null,
              userAgent: ctx?.userAgent ?? null,
              after: null,
              before: null,
            });
          }
        } catch (e) {
          this.logger.error('Failed to record audit event', e as Error);
        }
      }),
    );
  }
}
