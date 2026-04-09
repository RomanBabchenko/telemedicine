export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreateIntentInput {
  amount: number; // in major units (e.g. UAH)
  currency: string;
  appointmentId: string;
  patientId: string;
  tenantId: string;
}

export interface CreateIntentResult {
  intentId: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
}

export interface PaymentCaptureResult {
  intentId: string;
  status: 'SUCCEEDED' | 'FAILED';
  amount: number;
  currency: string;
  raw: Record<string, unknown>;
}

export interface RefundResult {
  intentId: string;
  amount: number;
  refundId: string;
}

export interface NormalizedWebhookEvent {
  eventId: string;
  intentId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.refunded';
  amount: number;
  currency: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: string;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  capture(intentId: string): Promise<PaymentCaptureResult>;
  refund(intentId: string, amount: number, reason?: string): Promise<RefundResult>;
  parseWebhook(headers: Record<string, string>, rawBody: string | Buffer): Promise<NormalizedWebhookEvent | null>;
}
