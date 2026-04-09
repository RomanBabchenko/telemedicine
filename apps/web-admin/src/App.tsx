import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@telemed/ui';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { DoctorsPage } from './pages/doctors/DoctorsPage';
import { AppointmentsPage } from './pages/appointments/AppointmentsPage';
import { BrandingPage } from './pages/branding/BrandingPage';
import { FeaturesPage } from './pages/features/FeaturesPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { BillingPage } from './pages/billing/BillingPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { AuditPage } from './pages/audit/AuditPage';
import { useAuthStore } from './stores/auth.store';
import { useTenant } from './hooks/useTenant';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const ProtectedRoutes = () => {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/login" replace />;
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/doctors" element={<DoctorsPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/branding" element={<BrandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/audit" element={<AuditPage />} />
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
