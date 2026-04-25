import { PaginatedResponseDto, buildPaginationMeta } from '../dto/pagination.dto';

/**
 * Contract for module-level mappers that translate domain entities into
 * response DTOs. Every module under src/modules is expected to expose at least
 * one `to<X>Response` function following this shape so controllers never leak
 * raw TypeORM entities to the HTTP layer.
 */
export interface ResponseMapper<TEntity, TDto> {
  toDto(entity: TEntity): TDto;
}

/**
 * Helper to build a PaginatedResponseDto<T> from an entity slice plus total.
 * Use when a list endpoint already has a `toDto` function and a simple
 * `findAndCount` result.
 */
export const toPage = <TEntity, TDto>(
  entities: TEntity[],
  total: number,
  page: number,
  limit: number,
  toDto: (e: TEntity) => TDto,
): PaginatedResponseDto<TDto> => ({
  items: entities.map(toDto),
  meta: buildPaginationMeta(total, page, limit),
});
