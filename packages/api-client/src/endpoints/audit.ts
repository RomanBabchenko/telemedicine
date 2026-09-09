import type { AuditEventDto, AuditEventQuery, PaginatedResult } from '@telemed/shared-types';
import type { ApiClient } from '../http';
import { toPaginated, type ApiPage } from '../pagination';

export const auditApi = (client: ApiClient) => ({
  list: async (query?: AuditEventQuery): Promise<PaginatedResult<AuditEventDto>> =>
    toPaginated(await client.get<ApiPage<AuditEventDto>>('/audit/events', { params: query })),
});
