import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { Button } from '@telemed/ui';
import { useTenant } from '../hooks/useTenant';

export const AppLayout = () => {
  const tenant = useTenant();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-full flex flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.brandName} className="h-8" />
            ) : (
              <span
                className="rounded bg-[color:var(--color-primary)] px-2 py-1 text-sm font-bold text-white"
              >
                Telemed
              </span>
            )}
            <span className="text-sm font-semibold text-slate-700">
              {tenant?.brandName ?? 'Telemed'}
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/doctors" className="text-slate-700 hover:underline">
              Лікарі
            </Link>
            {user && (
              <>
                <Link to="/appointments" className="text-slate-700 hover:underline">
                  Мої консультації
                </Link>
                <Link to="/documents" className="text-slate-700 hover:underline">
                  Документи
                </Link>
                <Link to="/profile" className="text-slate-700 hover:underline">
                  Профіль
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Вийти
                </Button>
              </>
            )}
            {!user && (
              <Button size="sm" onClick={() => navigate('/auth/login')}>
                Увійти
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {tenant?.brandName ?? 'Telemed'} · MVP
      </footer>
    </div>
  );
};
