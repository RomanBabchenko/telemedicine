import { ReactNode } from 'react';
import { Card } from './Card';

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
}

export const Stat = ({ label, value, hint }: Props) => (
  <Card className="flex flex-col">
    <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
    <span className="mt-1 text-2xl font-semibold text-slate-900">{value}</span>
    {hint ? <span className="mt-1 text-xs text-slate-500">{hint}</span> : null}
  </Card>
);
