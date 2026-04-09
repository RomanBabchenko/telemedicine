import { SetMetadata } from '@nestjs/common';

export interface AuditableOptions {
  action: string;
  resource: string;
  captureBody?: boolean;
}

export const AUDITABLE_KEY = 'auditable';
export const Auditable = (options: AuditableOptions) => SetMetadata(AUDITABLE_KEY, options);

export const AUDIT_VIEW_KEY = 'auditView';
export const AuditViewAccess = (resource: string) =>
  SetMetadata(AUDIT_VIEW_KEY, { resource });
