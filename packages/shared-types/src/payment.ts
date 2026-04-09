import { LedgerAccount, PaymentStatus } from './enums';

export interface CreatePaymentIntentDto {
  appointmentId: string;
}

export interface PaymentIntentDto {
  intentId: string;
  paymentId: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
}

export interface PaymentDto {
  id: string;
  appointmentId: string;
  patientId: string;
  provider: string;
  providerIntentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
}

export interface RefundDto {
  paymentId: string;
  amount: number;
  reason?: string;
}

export interface LedgerEntryDto {
  id: string;
  paymentId: string | null;
  appointmentId: string | null;
  account: LedgerAccount;
  debit: number;
  credit: number;
  memo: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  status: string;
  pdfUrl: string | null;
  createdAt: string;
}
