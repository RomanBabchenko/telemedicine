import { ApiProperty } from '@nestjs/swagger';

export class StartRecordingResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ format: 'uuid' })
  recordingId!: string;
}
