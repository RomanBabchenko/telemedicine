import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdatePaymentStatusBodyDto {
  @ApiProperty({ enum: ['paid', 'unpaid'], description: 'New payment status set by the MIS' })
  @IsIn(['paid', 'unpaid'])
  paymentStatus!: 'paid' | 'unpaid';
}
