import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@telemed/ui';
import { useAuthStore } from '../stores/auth.store';

const CLINIC_NAV: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Дашборд' },
  { to: '/doctors', label: 'Лікарі' },
  { to: '/appointments', label: 'Прийоми' },
  { to: '/users', label: 'Користувачі' },
  { to: '/integrations', label: 'МІС' },
  { to: '/integration-keys', label: 'API ключі' },
  { to: '/billing', label: 'Білінг' },
  { to: '/analytics', label: 'Аналітика' },
  { to: '/branding', label: 'Брендинг' },
  { to: '/features', label: 'Модулі' },
  { to: '/audit', label: 'Аудит' },
];

const PLATFORM_NAV: Array<{ to: string; label: string }> = [
  { to: '/platform/tenants', label: 'Клініки' },
  { to: '/platform/users', label: 'Усі користувачі' },
];

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const loc = useLocation();
  const isPlatformAdmin = user?.roles?.includes('PLATFORM_SUPER_ADMIN') ?? false;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[color:var(--color-primary)] px-2 py-1 text-sm font-bold text-white">
              Telemed
            </span>
            <span className="text-sm font-semibold text-slate-700">Адміністратор клініки</span>
          </div>
          <div className="text-sm text-slate-500">
            {user?.firstName} {user?.lastName}
            <Button
              className="ml-3"
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                navigate('/auth/login');
              }}
            >
              Вийти
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-7xl px-4">
          <div className="flex flex-wrap items-center gap-1 py-2 text-sm">
            {CLINIC_NAV.map((item) => {
              const active = loc.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-1.5 ${
                    active
                      ? 'bg-[color:var(--color-primary)] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {isPlatformAdmin ? (
              <>
                <span className="mx-2 h-5 w-px bg-slate-300" aria-hidden />
                <span className="px-1 text-xs uppercase tracking-wider text-slate-400">
                  Платформа
                </span>
                {PLATFORM_NAV.map((item) => {
                  const active = loc.pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`rounded-md px-3 py-1.5 ${
                        active
                          ? 'bg-amber-500 text-white'
                          : 'text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </>
            ) : null}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
};
