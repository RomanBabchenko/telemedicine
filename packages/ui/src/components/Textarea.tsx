import { forwardRef, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-[color:var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-blue-100',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';
