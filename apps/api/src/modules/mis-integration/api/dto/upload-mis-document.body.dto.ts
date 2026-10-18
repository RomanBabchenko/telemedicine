import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  MIS_DOCUMENT_CONTENT_TYPES,
  MIS_DOCUMENT_MAX_BYTES,
  type MisDocumentContentType,
  type MisDocumentUploadDto,
} from '@telemed/shared-types';

// 4 base64 chars per 3 decoded bytes, rounded up to a whole quantum.
export const MIS_DOCUMENT_MAX_BASE64_LENGTH = Math.ceil(MIS_DOCUMENT_MAX_BYTES / 3) * 4;

/**
 * One file the patient app relays to the MIS upload URL. The body is JSON on
 * purpose (the MIS contract wants base64 in the body); the route has its own
 * 15 MB body-parser limit in main.ts so the 10 MiB decoded cap fits.
 */
export class UploadMisDocumentBodyDto implements MisDocumentUploadDto {
  @ApiProperty({ maxLength: 255, example: 'analysis-2026-10.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  // No path separators / shell-ish characters / control chars: the MIS may
  // use the name verbatim when it writes the file.
  @Matches(/^[^\\/:*?"<>|\u0000-\u001f]+$/, {
    message: 'fileName contains forbidden characters',
  })
  fileName!: string;

  @ApiProperty({ enum: MIS_DOCUMENT_CONTENT_TYPES })
  @IsIn(MIS_DOCUMENT_CONTENT_TYPES)
  contentType!: MisDocumentContentType;

  @ApiProperty({
    minimum: 1,
    maximum: MIS_DOCUMENT_MAX_BYTES,
    description: 'Decoded file size in bytes; must match the decoded length of contentBase64.',
  })
  @IsInt()
  @Min(1)
  @Max(MIS_DOCUMENT_MAX_BYTES)
  sizeBytes!: number;

  @ApiProperty({
    description: 'Raw base64 of the file contents — no `data:` URL prefix, no line breaks.',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(MIS_DOCUMENT_MAX_BASE64_LENGTH)
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/, {
    message: 'contentBase64 must be raw base64 without a data: prefix',
  })
  contentBase64!: string;
}
