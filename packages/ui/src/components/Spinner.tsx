import { cn } from '../lib/cn';

export const Spinner = ({ className }: { className?: string }) => (
  <div
    className={cn(
      'h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[color:var(--color-primary)]',
      className,
    )}
  />
);
