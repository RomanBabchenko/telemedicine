import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../domain/entities/audit-event.entity';

export interface AuditEventInput {
  actorUserId: string | null;
  tenantId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(
    @InjectRepository(AuditEvent) private readonly repo: Repository<AuditEvent>,
  ) {}

  async record(input: AuditEventInput): Promise<void> {
    const entity = this.repo.create({
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    try {
      await this.repo.save(entity);
    } catch (e) {
      this.logger.error('Failed to persist audit event', e as Error);
    }
  }

  /**
   * Fire-and-forget: used by the AuditInterceptor on the response hot path.
   * Errors are logged, never thrown.
   */
  recordAsync(input: AuditEventInput): void {
    this.record(input).catch((e) =>
      this.logger.error('Failed to persist audit event (async)', e as Error),
    );
  }
}
