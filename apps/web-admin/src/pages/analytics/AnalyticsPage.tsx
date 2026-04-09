import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@telemed/api-client';
import { Card, PageHeader, Spinner, Stat } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const analytics = analyticsApi(apiClient);

export const AnalyticsPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const tenantQ = useQuery({
    queryKey: ['tenant-analytics', tenantId],
    queryFn: () => analytics.tenant(tenantId!),
    enabled: !!tenantId,
  });

  if (tenantQ.isLoading) return <Spinner />;
  const stats = tenantQ.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Аналітика" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Виручка онлайн" value={`${stats?.onlineRevenue ?? 0} ₴`} />
        <Stat label="Завантаженість" value={`${stats?.utilizationPct ?? 0}%`} />
        <Stat label="Запис → оплата" value={`${stats?.bookingToPaymentConversion ?? 0}%`} />
        <Stat label="Оплата → візит" value={`${stats?.paymentToShownConversion ?? 0}%`} />
      </div>
      <Card>
        <h3 className="mb-2 font-semibold">Скасування за причинами</h3>
        <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs">
          {JSON.stringify(stats?.cancellationsByReason ?? {}, null, 2)}
        </pre>
      </Card>
    </div>
  );
};
