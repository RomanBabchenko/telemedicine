import { ApiProperty } from '@nestjs/swagger';

export class UploadIntentResponseDto {
  @ApiProperty({ format: 'uuid', description: 'FileAsset identifier to store alongside your entity' })
  fileId!: string;

  @ApiProperty({ description: 'Object key within the tenant bucket' })
  objectKey!: string;

  @ApiProperty({ description: 'Short-lived pre-signed PUT URL — upload the raw bytes here' })
  uploadUrl!: string;
}
