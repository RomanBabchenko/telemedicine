import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2',
        invalid
          ? 'border-red-400 focus:ring-red-200'
          : 'border-slate-300 focus:border-[color:var(--color-primary)] focus:ring-blue-100',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
