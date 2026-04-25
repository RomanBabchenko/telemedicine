import { ApiProperty } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({ description: 'Short-lived pre-signed URL — typically valid for a few minutes' })
  url!: string;
}
