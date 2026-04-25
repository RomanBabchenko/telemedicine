import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentType } from '@telemed/shared-types';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { GrantConsentDto } from '@telemed/shared-types';

const CONSENT_VALUES: ConsentType[] = [
  ConsentType.TERMS,
  ConsentType.PRIVACY,
  ConsentType.TELEMED,
  ConsentType.AUDIO_RECORDING,
  ConsentType.MARKETING,
];

export class GrantConsentBodyDto implements GrantConsentDto {
  @ApiProperty({ enum: CONSENT_VALUES })
  @IsIn(CONSENT_VALUES)
  type!: ConsentType;

  @ApiPropertyOptional({
    description: "Version of the consent text the user accepted; defaults to 'v1'",
  })
  @IsOptional()
  @IsString()
  versionCode!: string;
}
