import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@telemed/ui';
import { AppLayout } from './components/AppLayout';
import { LandingPage } from './pages/landing/LandingPage';
import { DoctorsPage } from './pages/doctors/DoctorsPage';
import { DoctorProfilePage } from './pages/doctors/DoctorProfilePage';
import { BookingPage } from './pages/booking/BookingPage';
import { BookingPaymentPage } from './pages/booking/BookingPaymentPage';
import { BookingSuccessPage } from './pages/booking/BookingSuccessPage';
import { AppointmentsPage } from './pages/appointments/AppointmentsPage';
import { AppointmentJoinPage } from './pages/appointments/AppointmentJoinPage';
import { DocumentsPage } from './pages/documents/DocumentsPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { LoginPage } from './pages/auth/LoginPage';
import { OtpPage } from './pages/auth/OtpPage';
import { InvitePage } from './pages/invite/InvitePage';
import { useAuthStore } from './stores/auth.store';
import { useTenant } from './hooks/useTenant';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const ProtectedRoutes = () => {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/login" replace />;

  // Invite-scoped session (named or anonymous): only the waiting room +
  // video is reachable. All other paths bounce back to the join page so the
  // user can't stumble into appointment history, doctor search, etc. The
  // backend enforces the same rule via @InviteAccessible; this is UX only.
  if ((user.scope === 'invite' || user.scope === 'invite-anon') && user.inviteCtx) {
    const joinPath = `/appointments/${user.inviteCtx.appointmentId}/join`;
    return (
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/appointments/:id/join" element={<AppointmentJoinPage />} />
        </Route>
        <Route path="*" element={<Navigate to={joinPath} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/doctors" element={<DoctorsPage />} />
        <Route path="/doctors/:id" element={<DoctorProfilePage />} />
        <Route path="/booking/:slotId" element={<BookingPage />} />
        <Route path="/booking/:appointmentId/payment" element={<BookingPaymentPage />} />
        <Route path="/booking/:appointmentId/success" element={<BookingSuccessPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/appointments/:id/join" element={<AppointmentJoinPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
    </Routes>
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
        <Route path="/auth/otp" element={<OtpPage />} />
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
