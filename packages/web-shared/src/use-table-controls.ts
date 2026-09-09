import { useMemo, useState } from 'react';
import type { SortDirection } from '@telemed/ui';

export interface TableControls<T> {
  /** Rows of the current page (after filter + sort). */
  rows: T[];
  /** Rows matching the filter across all pages — for "nothing found" checks. */
  total: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  /** Current sort field (key passed to toggleSort), or null. */
  sortField: string | null;
  sortDir: SortDirection;
  /** Click handler for SortableTH — cycles asc → desc on the same field. */
  toggleSort: (field: string) => void;
  /** Convenience for SortableTH's `active` prop. */
  sortActive: (field: string) => SortDirection | null;
}

interface Options<T> {
  /** Extract a comparable value per sort field. */
  sortValues: Record<string, (row: T) => string | number | null | undefined>;
  /** Optional predicate applied before sorting (status filters, search, …). */
  filter?: (row: T) => boolean;
  initialSort?: { field: string; dir: SortDirection };
  /** Client-side page size. Defaults to DEFAULT_PAGE_SIZE. */
  pageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 20;

// Client-side sorting + filtering + paging over an already-loaded array.
// Endpoints that return everything (billing, keys, tenants) stay as they
// are; the page just stops rendering hundreds of rows at once. Lists with
// real server paging (appointments, users, doctors, audit) don't use this.
export function useTableControls<T>(data: T[] | undefined, options: Options<T>): TableControls<T> {
  const [sortField, setSortField] = useState<string | null>(options.initialSort?.field ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(options.initialSort?.dir ?? 'asc');
  const [page, setPage] = useState(1);
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let out = data ?? [];
    if (options.filter) out = out.filter(options.filter);
    if (sortField && options.sortValues[sortField]) {
      const getVal = options.sortValues[sortField];
      out = [...out].sort((a, b) => {
        const va = getVal(a);
        const vb = getVal(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1; // nulls last regardless of direction
        if (vb == null) return -1;
        const cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'uk');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
    // options.filter/sortValues are fresh closures each render by design —
    // they close over the caller's filter state, which is what should drive
    // recomputation (together with data and the sort keys).
  }, [data, options.filter, sortField, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter/sort changes (or a shrinking dataset) can leave `page` past the
  // end — clamp instead of showing an empty page.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  return {
    rows,
    total: filtered.length,
    page: safePage,
    pageSize,
    setPage,
    sortField,
    sortDir,
    toggleSort,
    sortActive: (field) => (sortField === field ? sortDir : null),
  };
}
