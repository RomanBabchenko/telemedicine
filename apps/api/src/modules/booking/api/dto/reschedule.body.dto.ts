import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { RescheduleAppointmentDto } from '@telemed/shared-types';

export class RescheduleBodyDto implements RescheduleAppointmentDto {
  @ApiProperty({ format: 'uuid', description: 'New slot to move the appointment to' })
  @IsUUID()
  newSlotId!: string;
}
