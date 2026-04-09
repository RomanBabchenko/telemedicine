import { ReactNode } from 'react';

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

export const TR = ({ children }: TableProps) => <tr>{children}</tr>;

export const TH = ({ children }: TableProps) => (
  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
    {children}
  </th>
);

export const TD = ({ children }: TableProps) => (
  <td className="px-4 py-3 text-sm text-slate-700">{children}</td>
);
