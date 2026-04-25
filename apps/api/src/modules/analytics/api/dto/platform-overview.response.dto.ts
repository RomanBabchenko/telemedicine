import { ApiProperty } from '@nestjs/swagger';

export class PlatformOverviewResponseDto {
  @ApiProperty({ description: 'Gross merchandise value (sum of PATIENT_PAYABLE debit entries)' })
  gmv!: number;

  @ApiProperty({ description: 'Platform cut as a percentage of GMV' })
  takeRate!: number;

  @ApiProperty({ description: 'Net revenue (PLATFORM_REVENUE credit entries)' })
  netRevenue!: number;

  @ApiProperty({ description: 'Refund rate, percent' })
  refundRate!: number;

  @ApiProperty()
  doctorActivation!: number;

  @ApiProperty()
  averageRevenuePerTenant!: number;

  @ApiProperty()
  averageRevenuePerDoctor!: number;
}
