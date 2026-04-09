import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { integrationsApi } from '@telemed/api-client';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const integrations = integrationsApi(apiClient);

export const IntegrationsPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['mis-status', tenantId],
    queryFn: () => integrations.status(tenantId!),
    enabled: !!tenantId,
  });
  const errorsQ = useQuery({
    queryKey: ['mis-errors', tenantId],
    queryFn: () => integrations.errors(tenantId!),
    enabled: !!tenantId,
  });

  const fullSyncM = useMutation({
    mutationFn: () => integrations.fullSync(tenantId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-status', tenantId] });
      qc.invalidateQueries({ queryKey: ['mis-errors', tenantId] });
    },
  });

  if (statusQ.isLoading) return <Spinner />;
  const status = statusQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Інтеграція з МІС"
        description="DocDream (stub) — синхронізація лікарів, пацієнтів і слотів"
        actions={
          <Button onClick={() => fullSyncM.mutate()} isLoading={fullSyncM.isPending}>
            Запустити повну синхронізацію
          </Button>
        }
      />
      <Card>
        <p>Конектор: <Badge>{status?.connector}</Badge></p>
        <p>Статус: <Badge variant={status?.enabled ? 'success' : 'default'}>{status?.enabled ? 'увімкнено' : 'вимкнено'}</Badge></p>
        <p>Остання повна синхронізація: {status?.lastFullSyncAt ? dayjs(status.lastFullSyncAt).format('DD.MM.YYYY HH:mm') : '—'}</p>
        <p>Помилок: {status?.pendingErrors ?? 0}</p>
        {fullSyncM.isSuccess ? <Alert variant="success">Синхронізація завершена</Alert> : null}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Останні помилки</h3>
        {(errorsQ.data?.length ?? 0) === 0 ? (
          <EmptyState title="Немає помилок" />
        ) : (
          <div className="space-y-2 text-sm">
            {errorsQ.data?.map((e) => (
              <div key={e.id} className="rounded border border-red-200 bg-red-50 p-2">
                <div className="font-mono text-xs text-red-800">{e.id}</div>
                <div className="text-red-900">{e.message}</div>
                <div className="text-xs text-red-700">{dayjs(e.createdAt).format('DD.MM HH:mm')}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
