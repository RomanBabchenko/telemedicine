import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { CreatePaymentIntentDto } from '@telemed/shared-types';

export class CreateIntentBodyDto implements CreatePaymentIntentDto {
  @ApiProperty({ format: 'uuid', description: 'Appointment this payment intent is associated with' })
  @IsUUID()
  appointmentId!: string;
}
