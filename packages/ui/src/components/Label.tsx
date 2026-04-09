import { LabelHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Label = ({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn('block text-sm font-medium text-slate-700 mb-1', className)}
    {...rest}
  />
);
