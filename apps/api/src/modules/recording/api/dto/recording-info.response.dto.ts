import { ApiProperty } from '@nestjs/swagger';

export class RecordingInfoResponseDto {
  @ApiProperty({ format: 'uuid' })
  recordingId!: string;

  @ApiProperty({ enum: ['RECORDING', 'STORED', 'DELETED'] })
  status!: string;

  @ApiProperty({ description: 'Duration in seconds; 0 while still recording' })
  durationSec!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Short-lived pre-signed download URL — present only when status === STORED',
  })
  downloadUrl!: string | null;
}
