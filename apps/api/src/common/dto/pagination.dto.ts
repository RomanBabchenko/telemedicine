import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Field to sort by' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of items across all pages' })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)' })
  page!: number;

  @ApiProperty({ description: 'Requested page size' })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages' })
  pageCount!: number;
}

/**
 * Generic paginated response envelope. Concrete modules extend this by passing
 * a per-type `items` shape via the @ApiPaginatedResponse() helper so Swagger
 * can reference the element type directly.
 */
export class PaginatedResponseDto<T> {
  items!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number,
): PaginationMetaDto => ({
  total,
  page,
  limit,
  pageCount: limit > 0 ? Math.ceil(total / limit) : 0,
});
