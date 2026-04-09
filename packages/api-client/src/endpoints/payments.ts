import type {
  CreatePaymentIntentDto,
  InvoiceDto,
  LedgerEntryDto,
  PaymentDto,
  PaymentIntentDto,
  RefundDto,
} from '@telemed/shared-types';
import type { ApiClient } from '../http';

export const paymentsApi = (client: ApiClient) => ({
  createIntent: (dto: CreatePaymentIntentDto) =>
    client.post<PaymentIntentDto>('/payments/intent', dto),
  getById: (id: string) => client.get<PaymentDto>(`/payments/${id}`),
  refund: (dto: RefundDto) => client.post<PaymentDto>('/payments/refund', dto),
  // dev-only stub helper:
  stubSucceed: (intentId: string) =>
    client.post<{ ok: true }>(`/payments/stub/succeed/${intentId}`),
  tenantInvoices: (tenantId: string) =>
    client.get<InvoiceDto[]>(`/billing/tenant/${tenantId}/invoices`),
  tenantLedger: (tenantId: string) =>
    client.get<LedgerEntryDto[]>(`/billing/tenant/${tenantId}/ledger`),
});
