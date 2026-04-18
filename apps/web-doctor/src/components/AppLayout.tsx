import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@telemed/ui';
import { useAuthStore } from '../stores/auth.store';

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const isInviteScope = user?.scope === 'invite';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to={isInviteScope ? '#' : '/'} className="flex items-center gap-2">
            <span className="rounded bg-[color:var(--color-primary)] px-2 py-1 text-sm font-bold text-white">
              Telemed
            </span>
            <span className="text-sm font-semibold text-slate-700">Кабінет лікаря</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {!isInviteScope && (
              <>
                <Link to="/" className="text-slate-700 hover:underline">
                  Дашборд
                </Link>
                <Link to="/appointments" className="text-slate-700 hover:underline">
                  Прийоми
                </Link>
                <Link to="/profile" className="text-slate-700 hover:underline">
                  Профіль
                </Link>
              </>
            )}
            <span className="text-xs text-slate-500">
              {user?.firstName} {user?.lastName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                navigate('/auth/login');
              }}
            >
              Вийти
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
};
