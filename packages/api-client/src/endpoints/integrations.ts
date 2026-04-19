import type {
  CreateIntegrationApiKeyDto,
  CreateIntegrationApiKeyResponseDto,
  IntegrationApiKeyDto,
} from '@telemed/shared-types';
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

export const integrationKeysApi = (client: ApiClient) => ({
  list: (tenantId: string, connectorId?: string) => {
    const qs = connectorId
      ? `?connectorId=${encodeURIComponent(connectorId)}`
      : '';
    return client.get<IntegrationApiKeyDto[]>(
      `/admin/integrations/${tenantId}/keys${qs}`,
    );
  },
  create: (tenantId: string, dto: CreateIntegrationApiKeyDto) =>
    client.post<CreateIntegrationApiKeyResponseDto>(
      `/admin/integrations/${tenantId}/keys`,
      dto,
    ),
  revoke: (tenantId: string, keyId: string) =>
    client.post<{ ok: true }>(
      `/admin/integrations/${tenantId}/keys/${keyId}/revoke`,
    ),
});
