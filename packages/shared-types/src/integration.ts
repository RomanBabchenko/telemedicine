import type { MisDocumentContentType } from './index';

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

// One file relayed by the patient app to the MIS upload URL stored on the
// appointment. The browser never sees that URL — it posts here and the API
// forwards the JSON (with the base64 payload) server-side, storing nothing.
export interface MisDocumentUploadDto {
  fileName: string;
  contentType: MisDocumentContentType;
  // Decoded size — must equal the byte length of contentBase64 once decoded.
  sizeBytes: number;
  // Raw base64 (no `data:` prefix), at most MIS_DOCUMENT_MAX_BYTES decoded.
  contentBase64: string;
}

export interface MisDocumentUploadResultDto {
  delivered: true;
  // HTTP status the MIS hub answered with (2xx).
  upstreamStatus: number;
}

export interface CreateIntegrationApiKeyResponseDto extends IntegrationApiKeyDto {
  // Present exclusively in the response to POST /keys. Store it immediately —
  // the server does not keep the raw key and cannot re-display it.
  rawKey: string;
}
