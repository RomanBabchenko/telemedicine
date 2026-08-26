import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md — forms (default); xl — detail views with wide content (audio player, tables). */
  size?: 'md' | 'xl';
}

const sizeClasses = {
  md: 'max-w-lg',
  xl: 'max-w-3xl',
};

export const Modal = ({ open, onClose, title, children, footer, size = 'md' }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portal to <body>: rendered in place, the overlay is a sibling inside
  // whatever layout container opened it, and utilities like `space-y-*`
  // reach it (margins apply to position:fixed too — the backdrop showed up
  // 24px short of the top edge). `m-0` guards against body-level margins.
  return createPortal(
    <div
      className="fixed inset-0 z-50 m-0 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={cn('w-full rounded-xl bg-white shadow-xl', sizeClasses[size])}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          // flex-wrap: long button labels must wrap to extra rows on narrow
          // screens instead of overflowing past the modal edge.
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
