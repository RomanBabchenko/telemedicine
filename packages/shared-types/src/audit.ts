export interface AuditEventDto {
  id: string;
  actorUserId: string | null;
  tenantId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditEventQuery {
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
