import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { RedisService } from '../../../../infrastructure/redis/redis.service';
import {
  CreateIntentInput,
  CreateIntentResult,
  NormalizedWebhookEvent,
  PaymentCaptureResult,
  PaymentProvider,
  RefundResult,
} from '../../domain/ports/payment-provider';

interface StubIntentData {
  intentId: string;
  amount: number;
  currency: string;
  appointmentId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}

@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  readonly id = 'stub';
  private readonly logger = new Logger(StubPaymentProvider.name);

  constructor(private readonly redis: RedisService) {}

  private key(intentId: string): string {
    return `stub-payment:${intentId}`;
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const intentId = `stub_${uuid()}`;
    const data: StubIntentData = {
      intentId,
      amount: input.amount,
      currency: input.currency,
      appointmentId: input.appointmentId,
      status: 'PENDING',
    };
    await this.redis.setEx(this.key(intentId), JSON.stringify(data), 24 * 3600);
    this.logger.log(`💳 stub intent created ${intentId} for ${input.amount} ${input.currency}`);
    return {
      intentId,
      clientSecret: `${intentId}_secret`,
      checkoutUrl: null, // stub UI handles the success directly
    };
  }

  async capture(intentId: string): Promise<PaymentCaptureResult> {
    return this.markSucceeded(intentId);
  }

  async markSucceeded(intentId: string): Promise<PaymentCaptureResult> {
    const raw = await this.redis.get(this.key(intentId));
    if (!raw) {
      throw new Error(`Stub intent ${intentId} not found`);
    }
    const data = JSON.parse(raw) as StubIntentData;
    data.status = 'SUCCEEDED';
    await this.redis.setEx(this.key(intentId), JSON.stringify(data), 24 * 3600);
    return {
      intentId,
      status: 'SUCCEEDED',
      amount: data.amount,
      currency: data.currency,
      raw: data as unknown as Record<string, unknown>,
    };
  }

  async refund(intentId: string, amount: number): Promise<RefundResult> {
    return { intentId, amount, refundId: `stub_refund_${uuid()}` };
  }

  async parseWebhook(
    _headers: Record<string, string>,
    rawBody: string | Buffer,
  ): Promise<NormalizedWebhookEvent | null> {
    try {
      const body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString());
      if (!body?.intentId) return null;
      return {
        eventId: body.eventId ?? `stub_event_${uuid()}`,
        intentId: body.intentId,
        type: body.type ?? 'payment.succeeded',
        amount: Number(body.amount ?? 0),
        currency: body.currency ?? 'UAH',
        raw: body,
      };
    } catch {
      return null;
    }
  }
}
