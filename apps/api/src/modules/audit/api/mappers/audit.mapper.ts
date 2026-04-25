import { AuditEvent } from '../../domain/entities/audit-event.entity';
import { AuditEventResponseDto } from '../dto/audit-event.response.dto';

export const toAuditEventResponse = (e: AuditEvent): AuditEventResponseDto => ({
  id: e.id,
  actorUserId: e.actorUserId,
  tenantId: e.tenantId,
  action: e.action,
  resourceType: e.resourceType,
  resourceId: e.resourceId,
  ip: e.ip,
  userAgent: e.userAgent,
  createdAt: e.createdAt.toISOString(),
  before: e.before,
  after: e.after,
});
