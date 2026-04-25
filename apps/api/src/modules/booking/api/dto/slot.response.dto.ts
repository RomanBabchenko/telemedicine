import { ApiProperty } from '@nestjs/swagger';
import { SlotStatus } from '@telemed/shared-types';
import type { SlotDto } from '@telemed/shared-types';

export class SlotResponseDto implements SlotDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  doctorId!: string;

  @ApiProperty({ format: 'uuid' })
  serviceTypeId!: string;

  @ApiProperty({ format: 'date-time' })
  startAt!: string;

  @ApiProperty({ format: 'date-time' })
  endAt!: string;

  @ApiProperty({ enum: Object.values(SlotStatus) })
  status!: SlotStatus;

  @ApiProperty({ description: 'True when the slot was synchronised from an external MIS' })
  sourceIsMis!: boolean;
}
