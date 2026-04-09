import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReferralTargetType } from '@telemed/shared-types';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrescriptionItemDto {
  @ApiProperty() @IsString() drug!: string;
  @ApiProperty() @IsString() dosage!: string;
  @ApiProperty() @IsString() frequency!: string;
  @ApiProperty() @IsInt() @Min(1) durationDays!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreatePrescriptionBodyDto {
  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}

export class CreateReferralBodyDto {
  @ApiProperty({ enum: ReferralTargetType }) @IsEnum(ReferralTargetType) targetType!: ReferralTargetType;
  @ApiProperty() @IsString() instructions!: string;
}
