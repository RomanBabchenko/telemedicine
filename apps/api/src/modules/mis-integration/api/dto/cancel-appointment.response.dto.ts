import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '@telemed/shared-types';

export class CancelAppointmentResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ enum: Object.values(AppointmentStatus) })
  status!: AppointmentStatus;

  @ApiProperty({ type: String, nullable: true })
  cancelledReason!: string | null;

  @ApiProperty({ description: 'Number of invite links that were revoked as part of the cancellation' })
  invitesRevoked!: number;
}
