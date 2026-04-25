import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartRecordingBodyDto {
  @ApiProperty({ format: 'uuid', description: 'Id of the AUDIO_RECORDING Consent granted by the patient' })
  @IsUUID()
  consentId!: string;
}
