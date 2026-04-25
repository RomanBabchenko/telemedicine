import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '@telemed/shared-types';

export class PaymentStatusResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ enum: ['paid', 'unpaid'] })
  misPaymentStatus!: 'paid' | 'unpaid';

  @ApiProperty({
    enum: Object.values(AppointmentStatus),
    description: "Appointment status after the update — CONFIRMED when transitioning paid from AWAITING_PAYMENT",
  })
  status!: AppointmentStatus;
}
