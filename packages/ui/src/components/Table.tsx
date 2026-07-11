import React, { ReactNode } from 'react';

interface TableProps {
  children: ReactNode;
}

export const Table = ({ children }: TableProps) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="min-w-full divide-y divide-slate-200">{children}</table>
  </div>
);

export const THead = ({ children }: TableProps) => <thead className="bg-slate-50">{children}</thead>;

export const TBody = ({ children }: TableProps) => (
  <tbody className="divide-y divide-slate-100">{children}</tbody>
);

export const TR = ({
  children,
  ...rest
}: TableProps & React.HTMLAttributes<HTMLTableRowElement>) => <tr {...rest}>{children}</tr>;

export const TH = ({ children }: TableProps) => (
  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
    {children}
  </th>
);

export type SortDirection = 'asc' | 'desc';

interface SortableTHProps {
  children: ReactNode;
  /** Sort direction when this column is active, null otherwise. */
  active: SortDirection | null;
  onSort: () => void;
}

// Clickable header cell for client-side sorting. Composes the same styling
// as TH; the parent owns the sort state (see useTableControls in web-shared).
export const SortableTH = ({ children, active, onSort }: SortableTHProps) => (
  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800"
    >
      {children}
      <span className="text-[10px]" aria-hidden>
        {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
      </span>
    </button>
  </th>
);

export const TD = ({ children }: TableProps) => (
  <td className="px-4 py-3 text-sm text-slate-700">{children}</td>
);
