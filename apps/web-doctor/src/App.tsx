import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@telemed/ui';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { InvitePage } from './pages/invite/InvitePage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AppointmentsPage } from './pages/appointments/AppointmentsPage';
import { ConsultationPage } from './pages/consultation/ConsultationPage';
import { ConsultationFinishPage } from './pages/consultation/ConsultationFinishPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { useAuthStore } from './stores/auth.store';
import { useTenant } from './hooks/useTenant';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const ProtectedRoutes = () => {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/login" replace />;

  // Invite-scoped doctor: only the consultation screen. Finish-page and the
  // rest of the cabinet are reserved for normally logged-in doctors.
  if (user.scope === 'invite' && user.inviteCtx) {
    const sessionPath = `/consultation/${user.inviteCtx.consultationSessionId}`;
    return (
      <AppLayout>
        <Routes>
          <Route path="/consultation/:sessionId" element={<ConsultationPage />} />
          <Route path="*" element={<Navigate to={sessionPath} replace />} />
        </Routes>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/consultation/:sessionId" element={<ConsultationPage />} />
        <Route path="/consultation/:sessionId/finish" element={<ConsultationFinishPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </AppLayout>
  );
};

const InnerApp = () => {
  const tenant = useTenant();
  return (
    <ThemeProvider
      theme={
        tenant
          ? {
              brandName: tenant.brandName,
              primaryColor: tenant.primaryColor,
              logoUrl: tenant.logoUrl,
            }
          : null
      }
    >
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </ThemeProvider>
  );
};

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <InnerApp />
  </QueryClientProvider>
);
