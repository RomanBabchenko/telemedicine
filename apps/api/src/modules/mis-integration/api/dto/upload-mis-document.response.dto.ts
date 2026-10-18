import { ApiProperty } from '@nestjs/swagger';
import type { MisDocumentUploadResultDto } from '@telemed/shared-types';

export class UploadMisDocumentResponseDto implements MisDocumentUploadResultDto {
  @ApiProperty({ example: true, description: 'Always true on success — failures are 4xx/5xx.' })
  delivered!: true;

  @ApiProperty({ example: 200, description: 'HTTP status returned by the MIS upload endpoint.' })
  upstreamStatus!: number;
}
