import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '@telemed/shared-types';

/**
 * Serialised Payment row. NOTE: `amount` is a numeric string here because
 * TypeORM stores money as `numeric(12,2)` and returns it as a string. The
 * shared-types `PaymentDto.amount` declares `number` — that contract drift
 * pre-dates this refactor and is not addressed here. Match runtime reality
 * so the existing admin UI (which formats `payment.amount` as a string) keeps
 * working.
 */
export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ description: 'Provider identifier (stub, stripe, liqpay, ...)' })
  provider!: string;

  @ApiProperty()
  providerIntentId!: string;

  @ApiProperty({ description: 'Numeric string (e.g. "150.00") from numeric(12,2) column' })
  amount!: string;

  @ApiProperty({ example: 'UAH' })
  currency!: string;

  @ApiProperty({ enum: Object.values(PaymentStatus) })
  status!: PaymentStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
