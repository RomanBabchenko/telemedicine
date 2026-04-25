import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { StartRecordingDto } from '@telemed/shared-types';

export class StartRecordingBodyDto implements StartRecordingDto {
  @ApiProperty({ format: 'uuid', description: 'Id of the recording Consent the patient granted' })
  @IsUUID()
  consentId!: string;
}
