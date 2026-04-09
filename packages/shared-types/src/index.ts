// =======================================================================
// All enums (as `as const` objects) are inlined here on purpose.
//
// Background: Vite's native ESM dev pipeline serves each .ts file via its
// own browser request. When `index.ts` does `export ... from './enums'`,
// Vite splits the graph and the browser may end up holding a stale, empty
// or partially-transpiled `enums.js` module — especially across workspace
// package boundaries where pre-bundling is disabled. Inlining the enum
// constants directly into the package entry file removes that whole class
// of issues without giving up the ergonomic `import { Role } from
// '@telemed/shared-types'` API.
//
// Backend (NestJS, webpack-built) keeps working because webpack bundles the
// whole graph into a single file regardless of file layout.
// =======================================================================

export const Role = {
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  CLINIC_ADMIN: 'CLINIC_ADMIN',
  CLINIC_OPERATOR: 'CLINIC_OPERATOR',
  PLATFORM_SUPPORT: 'PLATFORM_SUPPORT',
  PLATFORM_FINANCE: 'PLATFORM_FINANCE',
  PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
  MIS_SERVICE: 'MIS_SERVICE',
  AUDITOR: 'AUDITOR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AppointmentStatus = {
  DRAFT: 'DRAFT',
  RESERVED: 'RESERVED',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DOCUMENTATION_PENDING: 'DOCUMENTATION_PENDING',
  DOCUMENTATION_COMPLETED: 'DOCUMENTATION_COMPLETED',
  CANCELLED_BY_PATIENT: 'CANCELLED_BY_PATIENT',
  CANCELLED_BY_PROVIDER: 'CANCELLED_BY_PROVIDER',
  NO_SHOW_PATIENT: 'NO_SHOW_PATIENT',
  NO_SHOW_PROVIDER: 'NO_SHOW_PROVIDER',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const SlotStatus = {
  OPEN: 'OPEN',
  HELD: 'HELD',
  BOOKED: 'BOOKED',
  BLOCKED: 'BLOCKED',
} as const;
export type SlotStatus = (typeof SlotStatus)[keyof typeof SlotStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  DISPUTED: 'DISPUTED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const DocumentStatus = {
  DRAFT: 'DRAFT',
  SIGNED: 'SIGNED',
  AMENDED: 'AMENDED',
  VOIDED: 'VOIDED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const DocumentType = {
  CONCLUSION: 'CONCLUSION',
  NOTE: 'NOTE',
  CERTIFICATE: 'CERTIFICATE',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const ConsentType = {
  TERMS: 'TERMS',
  PRIVACY: 'PRIVACY',
  TELEMED: 'TELEMED',
  AUDIO_RECORDING: 'AUDIO_RECORDING',
  MARKETING: 'MARKETING',
} as const;
export type ConsentType = (typeof ConsentType)[keyof typeof ConsentType];

export const ConsentStatus = {
  GRANTED: 'GRANTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type ConsentStatus = (typeof ConsentStatus)[keyof typeof ConsentStatus];

export const ConsultationStatus = {
  SCHEDULED: 'SCHEDULED',
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  FAILED: 'FAILED',
} as const;
export type ConsultationStatus = (typeof ConsultationStatus)[keyof typeof ConsultationStatus];

export const ServiceMode = {
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  CHAT: 'CHAT',
} as const;
export type ServiceMode = (typeof ServiceMode)[keyof typeof ServiceMode];

export const LedgerAccount = {
  PATIENT_PAYABLE: 'PATIENT_PAYABLE',
  PLATFORM_REVENUE: 'PLATFORM_REVENUE',
  CLINIC_REVENUE: 'CLINIC_REVENUE',
  DOCTOR_PAYABLE: 'DOCTOR_PAYABLE',
  ACQUIRER_FEE: 'ACQUIRER_FEE',
  TAX: 'TAX',
  REFUND: 'REFUND',
  MIS_PARTNER_SHARE: 'MIS_PARTNER_SHARE',
} as const;
export type LedgerAccount = (typeof LedgerAccount)[keyof typeof LedgerAccount];

export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
  IN_APP: 'IN_APP',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  READ: 'READ',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const VerificationStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const ReferralTargetType = {
  LAB: 'LAB',
  IMAGING: 'IMAGING',
  SPECIALIST: 'SPECIALIST',
  IN_PERSON: 'IN_PERSON',
} as const;
export type ReferralTargetType = (typeof ReferralTargetType)[keyof typeof ReferralTargetType];

export const ParticipantRole = {
  PRIMARY_DOCTOR: 'PRIMARY_DOCTOR',
  SECONDARY_DOCTOR: 'SECONDARY_DOCTOR',
  PATIENT: 'PATIENT',
  OBSERVER: 'OBSERVER',
} as const;
export type ParticipantRole = (typeof ParticipantRole)[keyof typeof ParticipantRole];

export const SyncJobType = {
  FULL: 'FULL',
  INCREMENTAL: 'INCREMENTAL',
  RECONCILE: 'RECONCILE',
} as const;
export type SyncJobType = (typeof SyncJobType)[keyof typeof SyncJobType];

export const SyncJobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;
export type SyncJobStatus = (typeof SyncJobStatus)[keyof typeof SyncJobStatus];

// Sub-domain DTO modules below — they only re-export type aliases (not runtime
// values), so star re-exports are fine here.
export * from './auth';
export * from './tenant';
export * from './doctor';
export * from './patient';
export * from './booking';
export * from './consultation';
export * from './document';
export * from './payment';
export * from './notification';
export * from './audit';
export * from './common';
