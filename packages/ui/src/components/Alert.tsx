import { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface Props {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}

const variantClasses = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

export const Alert = ({ variant = 'info', title, children }: Props) => (
  <div className={cn('rounded-lg border p-4 text-sm', variantClasses[variant])}>
    {title ? <p className="mb-1 font-semibold">{title}</p> : null}
    {children}
  </div>
);
