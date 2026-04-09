import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ className, children, ...rest }: Props) => (
  <div
    className={cn(
      'rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
      className,
    )}
    {...rest}
  >
    {children}
  </div>
);

export const CardHeader = ({ className, children }: Props) => (
  <div className={cn('mb-4 flex items-center justify-between', className)}>{children}</div>
);

export const CardTitle = ({ className, children }: Props) => (
  <h3 className={cn('text-lg font-semibold text-slate-900', className)}>{children}</h3>
);
