import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@telemed/ui';
import { hasAnyRole, type Role } from '@telemed/shared-types';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { DoctorsPage } from './pages/doctors/DoctorsPage';
import { AppointmentsPage } from './pages/appointments/AppointmentsPage';
import { BrandingPage } from './pages/branding/BrandingPage';
import { FeaturesPage } from './pages/features/FeaturesPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { IntegrationKeysPage } from './pages/integration-keys/IntegrationKeysPage';
import { BillingPage } from './pages/billing/BillingPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { AuditPage } from './pages/audit/AuditPage';
import { UsersPage } from './pages/users/UsersPage';
import { UserDetailPage } from './pages/users/UserDetailPage';
import { PlatformTenantsPage } from './pages/platform/PlatformTenantsPage';
import { PlatformTenantEditPage } from './pages/platform/PlatformTenantEditPage';
import { useAuthStore } from './stores/auth.store';
import { useTenant } from './hooks/useTenant';
import { firstAccessiblePath, sectionRoles } from './lib/access';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const PlatformGuard = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  if (!user?.roles?.includes('PLATFORM_SUPER_ADMIN')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// Route-level counterpart of the nav filter in AppLayout — keeps deep links
// (e.g. /features typed by an INTEGRATION_ADMIN) from rendering a page the
// API would reject anyway.
const RequireRole = ({ roles, children }: { roles: readonly Role[]; children: React.ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  if (!hasAnyRole(user?.roles, roles)) {
    // Not "/": roles without dashboard access (IA/CMO) would redirect-loop.
    return <Navigate to={firstAccessiblePath(user?.roles)} replace />;
  }
  return <>{children}</>;
};

// Wraps a clinic page in the role guard configured for its section.
const guarded = (to: string, element: React.ReactNode) => (
  <RequireRole roles={sectionRoles(to)}>{element}</RequireRole>
);

const ProtectedRoutes = () => {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/login" replace />;
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={guarded('/', <DashboardPage />)} />
        <Route path="/doctors" element={guarded('/doctors', <DoctorsPage />)} />
        <Route path="/appointments" element={guarded('/appointments', <AppointmentsPage />)} />
        <Route path="/users" element={guarded('/users', <UsersPage scope="mine" />)} />
        <Route path="/users/:id" element={guarded('/users', <UserDetailPage />)} />
        <Route path="/branding" element={guarded('/branding', <BrandingPage />)} />
        <Route path="/features" element={guarded('/features', <FeaturesPage />)} />
        <Route path="/integrations" element={guarded('/integrations', <IntegrationsPage />)} />
        <Route
          path="/integration-keys"
          element={guarded('/integration-keys', <IntegrationKeysPage />)}
        />
        <Route path="/billing" element={guarded('/billing', <BillingPage />)} />
        <Route path="/analytics" element={guarded('/analytics', <AnalyticsPage />)} />
        <Route path="/audit" element={guarded('/audit', <AuditPage />)} />
        <Route
          path="/platform/tenants"
          element={
            <PlatformGuard>
              <PlatformTenantsPage />
            </PlatformGuard>
          }
        />
        <Route
          path="/platform/tenants/:id"
          element={
            <PlatformGuard>
              <PlatformTenantEditPage />
            </PlatformGuard>
          }
        />
        <Route
          path="/platform/users"
          element={
            <PlatformGuard>
              <UsersPage scope="all" />
            </PlatformGuard>
          }
        />
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
