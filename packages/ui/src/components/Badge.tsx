import { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
};

export const Badge = ({ variant = 'default', className, ...rest }: Props) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      variantClasses[variant],
      className,
    )}
    {...rest}
  />
);
