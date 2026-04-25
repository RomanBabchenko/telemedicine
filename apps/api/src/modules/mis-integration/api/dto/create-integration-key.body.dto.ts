import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Length } from 'class-validator';

export class CreateIntegrationKeyBodyDto {
  @ApiProperty({ description: 'Connector identifier (one key = one connector)', example: 'docdream' })
  @IsString()
  @Length(1, 64)
  connectorId!: string;

  @ApiPropertyOptional({ description: 'Free-form label shown in the admin UI' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'IP / CIDR allowlist (e.g. "10.0.0.5" or "10.0.0.0/24"). Omit to allow any source.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];
}
