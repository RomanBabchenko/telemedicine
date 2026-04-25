import { Payment } from '../../domain/entities/payment.entity';
import { Invoice } from '../../domain/entities/invoice.entity';
import { LedgerEntry } from '../../domain/entities/ledger-entry.entity';
import { PaymentResponseDto } from '../dto/payment.response.dto';
import { LedgerEntryResponseDto } from '../dto/ledger-entry.response.dto';
import { InvoiceResponseDto } from '../dto/invoice.response.dto';

export const toPaymentResponse = (p: Payment): PaymentResponseDto => ({
  id: p.id,
  tenantId: p.tenantId,
  appointmentId: p.appointmentId,
  patientId: p.patientId,
  provider: p.provider,
  providerIntentId: p.providerIntentId,
  amount: p.amount,
  currency: p.currency,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
});

export const toLedgerEntryResponse = (e: LedgerEntry): LedgerEntryResponseDto => ({
  id: e.id,
  tenantId: e.tenantId,
  paymentId: e.paymentId,
  appointmentId: e.appointmentId,
  account: e.account,
  debit: e.debit,
  credit: e.credit,
  memo: e.memo,
  createdAt: e.createdAt.toISOString(),
});

export const toInvoiceResponse = (i: Invoice): InvoiceResponseDto => ({
  id: i.id,
  tenantId: i.tenantId,
  periodStart: i.periodStart,
  periodEnd: i.periodEnd,
  totalAmount: i.totalAmount,
  status: i.status,
  pdfFileAssetId: i.pdfFileAssetId,
  createdAt: i.createdAt.toISOString(),
});
