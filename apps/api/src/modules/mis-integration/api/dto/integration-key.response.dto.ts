import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IntegrationKeyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  connectorId!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ description: 'Masked key preview (last 4 chars)' })
  keyMasked!: string;

  @ApiProperty({ type: [String], nullable: true })
  ipAllowlist!: string[] | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastUsedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class CreatedIntegrationKeyResponseDto extends IntegrationKeyResponseDto {
  @ApiProperty({
    description: 'Raw API key — returned exactly once at creation. Store on the caller side; the server only persists a hash.',
  })
  rawKey!: string;
}

export class IntegrationKeyRevokeResponseDto {
  @ApiProperty({ example: true })
  ok!: true;
}
