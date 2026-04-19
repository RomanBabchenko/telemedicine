export interface IntegrationApiKeyDto {
  id: string;
  connectorId: string;
  name: string | null;
  // Masked display form: `tmd_live_****3a2f`. The raw key is only returned
  // by the create endpoint, once — never re-read.
  keyMasked: string;
  ipAllowlist: string[] | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateIntegrationApiKeyDto {
  connectorId: string;
  name?: string;
  // Each entry must be either a plain IP (10.0.0.5) or an IPv4 CIDR
  // (10.0.0.0/24). null / empty array = allow any IP.
  ipAllowlist?: string[];
}

export interface CreateIntegrationApiKeyResponseDto extends IntegrationApiKeyDto {
  // Present exclusively in the response to POST /keys. Store it immediately —
  // the server does not keep the raw key and cannot re-display it.
  rawKey: string;
}
