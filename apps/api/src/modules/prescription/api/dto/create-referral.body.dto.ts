import { ApiProperty } from '@nestjs/swagger';
import { ReferralTargetType } from '@telemed/shared-types';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { CreateReferralDto } from '@telemed/shared-types';

const TARGET_VALUES: ReferralTargetType[] = [
  ReferralTargetType.LAB,
  ReferralTargetType.IMAGING,
  ReferralTargetType.SPECIALIST,
  ReferralTargetType.IN_PERSON,
];

export class CreateReferralBodyDto implements CreateReferralDto {
  @ApiProperty({ enum: TARGET_VALUES })
  @IsIn(TARGET_VALUES)
  targetType!: ReferralTargetType;

  @ApiProperty({ description: 'Doctor instructions / reason for referral' })
  @IsString()
  @MaxLength(4096)
  instructions!: string;
}
