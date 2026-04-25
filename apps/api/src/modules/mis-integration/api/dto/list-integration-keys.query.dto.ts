import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListIntegrationKeysQueryDto {
  @ApiPropertyOptional({ description: 'Filter by connector id' })
  @IsOptional()
  @IsString()
  connectorId?: string;
}
