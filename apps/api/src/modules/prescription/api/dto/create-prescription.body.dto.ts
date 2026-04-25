import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import type { CreatePrescriptionDto } from '@telemed/shared-types';
import { PrescriptionItemDto } from './prescription-item.dto';

export class CreatePrescriptionBodyDto implements CreatePrescriptionDto {
  @ApiProperty({ type: [PrescriptionItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}
