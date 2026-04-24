import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentStatus } from '@telemed/shared-types';
import { Payment } from '../domain/entities/payment.entity';
import { PAYMENT_PROVIDER, PaymentProvider } from '../domain/ports/payment-provider';
import { AppointmentService } from '../../booking/application/appointment.service';
import { ServiceType } from '../../booking/domain/entities/service-type.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { LedgerService } from './ledger.service';
import { PaymentSucceededEvent } from '../events/payment.events';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(ServiceType) private readonly services: Repository<ServiceType>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly tenantContext: TenantContextService,
    private readonly appointments: AppointmentService,
    private readonly ledger: LedgerService,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
  ) {}

  async createIntent(appointmentId: string): Promise<{
    paymentId: string;
    intentId: string;
    clientSecret: string | null;
    checkoutUrl: string | null;
    amount: number;
    currency: string;
    status: PaymentStatus;
  }> {
    const tenantId = this.tenantContext.getTenantId();
    const appointment = await this.appointments.getById(appointmentId);
    if (!appointment.patientId) {
      // Anonymous MIS appointments are billed by the MIS itself via prepaid
      // gating — no in-app payment flow.
      throw new BadRequestException(
        'Cannot create a payment intent for an anonymous appointment.',
      );
    }
    const patientId = appointment.patientId;
    const service = await this.services.findOne({
      where: { id: appointment.serviceTypeId, tenantId },
    });
    if (!service) throw new NotFoundException('Service type not found');

    const amount = Number(service.price);

    const intent = await this.provider.createIntent({
      amount,
      currency: 'UAH',
      appointmentId,
      patientId,
      tenantId,
    });

    const payment = this.payments.create({
      tenantId,
      appointmentId,
      patientId,
      provider: this.provider.id,
      providerIntentId: intent.intentId,
      amount: amount.toFixed(2),
      currency: 'UAH',
      status: PaymentStatus.PENDING,
    });
    await this.payments.save(payment);

    await this.appointments.markAwaitingPayment(appointmentId);
    await this.appointments.setPaymentId(appointmentId, payment.id);

    return {
      paymentId: payment.id,
      intentId: intent.intentId,
      clientSecret: intent.clientSecret,
      checkoutUrl: intent.checkoutUrl,
      amount,
      currency: 'UAH',
      status: PaymentStatus.PENDING,
    };
  }

  async getById(id: string): Promise<Payment> {
    const tenantId = this.tenantContext.getTenantId();
    const p = await this.payments.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  /**
   * Idempotent webhook handler. Looks up the payment by providerIntentId,
   * checks the event id has not been processed before, then runs ledger booking
   * and confirms the appointment in a single transaction.
   */
  async handleWebhook(rawBody: string | Buffer, headers: Record<string, string>): Promise<void> {
    const event = await this.provider.parseWebhook(headers, rawBody);
    if (!event) {
      this.logger.warn('Webhook payload could not be parsed');
      return;
    }

    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Payment);
      const payment = await repo.findOne({
        where: { provider: this.provider.id, providerIntentId: event.intentId },
      });
      if (!payment) {
        this.logger.warn(`No payment for intent ${event.intentId}`);
        return;
      }

      if (payment.webhookEventIds.includes(event.eventId)) {
        return; // already processed
      }
      payment.webhookEventIds = [...payment.webhookEventIds, event.eventId];

      if (event.type === 'payment.succeeded' && payment.status !== PaymentStatus.SUCCEEDED) {
        payment.status = PaymentStatus.SUCCEEDED;
        await repo.save(payment);
        await this.ledger.bookPaymentSucceeded(em, {
          tenantId: payment.tenantId,
          paymentId: payment.id,
          appointmentId: payment.appointmentId,
          totalAmount: Number(payment.amount),
          currency: payment.currency,
        });
        this.eventBus.publish(
          new PaymentSucceededEvent(
            payment.id,
            payment.tenantId,
            payment.appointmentId,
            Number(payment.amount),
          ),
        );
      } else if (event.type === 'payment.failed') {
        payment.status = PaymentStatus.FAILED;
        await repo.save(payment);
      } else if (event.type === 'payment.refunded') {
        payment.status = PaymentStatus.REFUNDED;
        await repo.save(payment);
      }
    });
  }

  async stubSimulateSuccess(intentId: string): Promise<void> {
    // Tell the provider to mark its in-Redis intent as succeeded, then push a fake webhook through ourselves.
    const provider = this.provider as unknown as { markSucceeded?: (id: string) => Promise<unknown> };
    if (provider.markSucceeded) {
      await provider.markSucceeded(intentId);
    }
    const fakePayload = JSON.stringify({
      eventId: `stub_evt_${Date.now()}`,
      intentId,
      type: 'payment.succeeded',
    });
    await this.handleWebhook(fakePayload, {});
  }
}
