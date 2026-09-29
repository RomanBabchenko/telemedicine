import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, MedViewLogo } from '@telemed/ui';
import { useAuthStore } from '../stores/auth.store';
import { useTenant } from '../hooks/useTenant';

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const tenant = useTenant();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const isInviteScope = user?.scope === 'invite';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to={isInviteScope ? '#' : '/'} className="flex items-center gap-2">
            {/* Clinic branding, same as the patient app: the clinic's logo and
             * name when set, the platform logo otherwise. */}
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.brandName} className="h-8" />
            ) : (
              <MedViewLogo size={28} withWordmark={!tenant?.brandName} />
            )}
            {tenant?.brandName ? (
              <span className="text-sm font-semibold text-slate-700">{tenant.brandName}</span>
            ) : null}
            <span
              className={
                tenant?.brandName
                  ? 'hidden text-sm text-slate-500 sm:inline'
                  : 'text-sm font-semibold text-slate-700'
              }
            >
              Кабінет лікаря
            </span>
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
            {/* No global logout for invite-link sessions: it drops the
             * single-use invite JWT and leaves the room outside the
             * consultation flow (recording keeps running, no way back).
             * Leaving goes through the call's own «Вийти» modal. */}
            {!isInviteScope && (
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
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {tenant?.brandName ?? 'Telemed'}
      </footer>
    </div>
  );
};
