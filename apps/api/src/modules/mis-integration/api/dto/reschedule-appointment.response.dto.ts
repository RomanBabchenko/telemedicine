import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '@telemed/shared-types';

export class RescheduleAppointmentResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ enum: Object.values(AppointmentStatus) })
  status!: AppointmentStatus;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ format: 'date-time' })
  endAt!: string;

  @ApiProperty({
    description:
      "Number of active invite links whose TTL was extended to match the new endAt. The links themselves are unchanged — re-sending them is not necessary; the patient and doctor keep using the original URLs.",
  })
  invitesUpdated!: number;
}
