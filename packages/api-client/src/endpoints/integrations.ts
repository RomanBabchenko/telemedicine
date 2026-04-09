import type { ApiClient } from '../http';

export interface IntegrationStatusDto {
  tenantId: string;
  connector: string;
  enabled: boolean;
  lastFullSyncAt: string | null;
  lastIncrementalSyncAt: string | null;
  pendingErrors: number;
}

export interface IntegrationErrorDto {
  id: string;
  jobId: string | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export const integrationsApi = (client: ApiClient) => ({
  status: (tenantId: string) =>
    client.get<IntegrationStatusDto>(`/integrations/${tenantId}/status`),
  errors: (tenantId: string) =>
    client.get<IntegrationErrorDto[]>(`/integrations/${tenantId}/errors`),
  fullSync: (tenantId: string) =>
    client.post<{ ok: true; jobId: string }>(`/integrations/${tenantId}/sync/full`),
  incrementalSync: (tenantId: string) =>
    client.post<{ ok: true; jobId: string }>(
      `/integrations/${tenantId}/sync/incremental`,
    ),
});
