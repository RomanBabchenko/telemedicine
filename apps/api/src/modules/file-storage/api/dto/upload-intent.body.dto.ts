import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Min } from 'class-validator';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'text/plain',
];

export class UploadIntentBodyDto {
  @ApiProperty({
    description: "Purpose tag stored on the FileAsset (e.g. 'document/conclusion', 'avatar', 'chat/attachment')",
    example: 'document/conclusion',
  })
  @IsString()
  @Matches(/^[a-z0-9_\-/]+$/, {
    message: 'purpose must contain only lowercase letters, digits, underscores, hyphens and slashes',
  })
  purpose!: string;

  @ApiProperty({ enum: ALLOWED_CONTENT_TYPES })
  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: string;

  @ApiProperty({ minimum: 1, description: 'File size in bytes (max 25 MB)' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
