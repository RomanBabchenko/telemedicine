import { ApiProperty } from '@nestjs/swagger';

export class TenantCancellationsBreakdownDto {
  @ApiProperty()
  total!: number;
}

export class TenantStatsResponseDto {
  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  onlineRevenue!: number;

  @ApiProperty({ description: 'Appointment completion ratio, percent' })
  utilizationPct!: number;

  @ApiProperty()
  bookingToPaymentConversion!: number;

  @ApiProperty()
  paymentToShownConversion!: number;

  @ApiProperty({ type: TenantCancellationsBreakdownDto })
  cancellationsByReason!: TenantCancellationsBreakdownDto;

  @ApiProperty()
  patientRetentionPct!: number;

  @ApiProperty({ type: Object, description: 'Appointment counts per specialization' })
  bySpecialization!: Record<string, number>;
}
