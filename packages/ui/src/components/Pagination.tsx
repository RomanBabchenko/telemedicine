import { Button } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Simple prev/next pager for server-paginated lists. Hidden entirely when
// everything fits on one page so existing screens don't grow chrome.
export const Pagination = ({ page, pageSize, total, onPageChange }: PaginationProps) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-3">
      <span className="text-xs text-slate-500">
        Сторінка {page} з {pages} · {total} записів
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Назад
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Далі →
        </Button>
      </div>
    </div>
  );
};
