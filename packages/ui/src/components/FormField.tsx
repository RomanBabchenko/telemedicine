import { ReactNode } from 'react';
import { Label } from './Label';

interface Props {
  label?: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}

export const FormField = ({ label, error, hint, htmlFor, children }: Props) => (
  <div className="mb-4">
    {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
    {children}
    {error ? (
      <p className="mt-1 text-xs text-red-600">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    ) : null}
  </div>
);
