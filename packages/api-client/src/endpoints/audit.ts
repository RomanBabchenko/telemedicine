import type { AuditEventDto, AuditEventQuery, PaginatedResult } from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const auditApi = (client: ApiClient) => ({
  list: (query?: AuditEventQuery) =>
    client.get<PaginatedResult<AuditEventDto>>('/audit/events', { params: query }),
});
