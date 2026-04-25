import { ApiProperty } from '@nestjs/swagger';
import { LedgerAccount } from '@telemed/shared-types';

/**
 * Ledger row. `debit` / `credit` are numeric strings (see PaymentResponseDto
 * note). The admin UI already wraps them in `Number(e.debit)` before display,
 * so runtime behaviour is preserved.
 */
export class LedgerEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  paymentId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  appointmentId!: string | null;

  @ApiProperty({ enum: Object.values(LedgerAccount) })
  account!: LedgerAccount;

  @ApiProperty({ description: 'Numeric string (e.g. "150.00")' })
  debit!: string;

  @ApiProperty({ description: 'Numeric string (e.g. "150.00")' })
  credit!: string;

  @ApiProperty({ type: String, nullable: true })
  memo!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
