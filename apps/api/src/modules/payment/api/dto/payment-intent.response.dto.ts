import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '@telemed/shared-types';

/**
 * Payment intent payload returned from POST /payments/intent.
 *
 * Note: the shared-types `PaymentIntentDto` types `amount` as `number`, but the
 * service returns a numeric value parsed from the service type's numeric column
 * at intent time, which is already number here. Matches shared-types exactly.
 */
export class PaymentIntentResponseDto {
  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ description: 'Provider-side intent id (e.g. Stripe PaymentIntent id)' })
  intentId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Client-side secret returned by providers like Stripe; null for server-only flows',
  })
  clientSecret!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Hosted checkout URL returned by providers like LiqPay; null when the SPA collects the card directly',
  })
  checkoutUrl!: string | null;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ example: 'UAH' })
  currency!: string;

  @ApiProperty({ enum: Object.values(PaymentStatus) })
  status!: PaymentStatus;
}
