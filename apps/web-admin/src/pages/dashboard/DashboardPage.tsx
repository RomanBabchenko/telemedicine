import { useQuery } from '@tanstack/react-query';
import { analyticsApi, tenantsApi } from '@telemed/api-client';
import { Card, PageHeader, Spinner, Stat } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const tenants = tenantsApi(apiClient);
const analytics = analyticsApi(apiClient);

export const DashboardPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantQ = useQuery({ queryKey: ['tenant', 'current'], queryFn: () => tenants.current() });
  const statsQ = useQuery({
    queryKey: ['tenant-stats', tenantId],
    queryFn: () => analytics.tenant(tenantId!),
    enabled: !!tenantId,
  });

  if (tenantQ.isLoading || statsQ.isLoading) return <Spinner />;
  const stats = statsQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenantQ.data?.brandName ?? 'Клініка'}
        description="Огляд по онлайн-направленню"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Виручка онлайн" value={`${stats?.onlineRevenue ?? 0} ₴`} />
        <Stat label="Завантаженість" value={`${stats?.utilizationPct ?? 0}%`} />
        <Stat label="Конверсія: запис → оплата" value={`${stats?.bookingToPaymentConversion ?? 0}%`} />
        <Stat
          label="Конверсія: оплата → візит"
          value={`${stats?.paymentToShownConversion ?? 0}%`}
        />
      </div>
      <Card>
        <h3 className="mb-2 font-semibold">White label статус</h3>
        <p className="text-sm text-slate-600">Бренд: {tenantQ.data?.brandName}</p>
        <p className="text-sm text-slate-600">Поддомен: {tenantQ.data?.subdomain}</p>
        <p className="text-sm text-slate-600">Локаль: {tenantQ.data?.locale}</p>
      </Card>
    </div>
  );
};
