import { ApiProperty } from '@nestjs/swagger';

/**
 * Invoice row. Field `pdfFileAssetId` is the FileAsset id — not a URL. The
 * frontend currently doesn't consume it (only period/amount/status are rendered);
 * keeping the raw id matches current behaviour and leaves URL construction to
 * a dedicated "download invoice PDF" endpoint.
 */
export class InvoiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'date' })
  periodStart!: string;

  @ApiProperty({ format: 'date' })
  periodEnd!: string;

  @ApiProperty({ description: 'Numeric string (e.g. "1500.00")' })
  totalAmount!: string;

  @ApiProperty({ example: 'DRAFT' })
  status!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  pdfFileAssetId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
