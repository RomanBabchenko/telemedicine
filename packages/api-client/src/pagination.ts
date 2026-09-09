import type { PaginatedResult } from '@telemed/shared-types';

// What the API actually sends for paged lists (PaginatedResponseDto).
export interface ApiPage<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; pageCount?: number };
}

// Flatten the API envelope to the { items, total, page, pageSize } shape every
// list page consumes. Centralised here because three screens used to read
// `data.total` straight off the envelope and silently got `undefined`,
// which hid their paginators.
export const toPaginated = <T>(res: ApiPage<T>): PaginatedResult<T> => ({
  items: res.items,
  total: res.meta.total,
  page: res.meta.page,
  pageSize: res.meta.limit,
});
