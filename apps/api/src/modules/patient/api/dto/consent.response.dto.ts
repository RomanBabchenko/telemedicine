import { ApiProperty } from '@nestjs/swagger';
import { ConsentStatus, ConsentType } from '@telemed/shared-types';
import type { ConsentDto } from '@telemed/shared-types';

export class ConsentResponseDto implements ConsentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Object.values(ConsentType) })
  type!: ConsentType;

  @ApiProperty({ enum: Object.values(ConsentStatus) })
  status!: ConsentStatus;

  @ApiProperty()
  versionCode!: string;

  @ApiProperty({ format: 'date-time' })
  grantedAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  withdrawnAt!: string | null;
}
