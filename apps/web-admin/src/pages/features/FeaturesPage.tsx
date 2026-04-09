import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '@telemed/api-client';
import { Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const tenants = tenantsApi(apiClient);

const FEATURE_LABELS: Record<string, string> = {
  b2cListing: 'B2C-каталог',
  bookingWidget: 'Віджет запису',
  embeddedConsultation: 'Вбудована консультація',
  prescriptionModule: 'Модуль рецептів',
  analyticsPackage: 'Аналітика',
  brandedPatientPortal: 'Брендований кабінет',
  misSync: 'Синхронізація з МІС',
  advancedReports: 'Розширені звіти',
  audioArchive: 'Аудіоархів',
  apiAccess: 'API-доступ',
};

export const FeaturesPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const qc = useQueryClient();
  const tenantQ = useQuery({ queryKey: ['tenant', 'current'], queryFn: () => tenants.current() });
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (tenantQ.data) setFeatures(tenantQ.data.features as unknown as Record<string, boolean>);
  }, [tenantQ.data]);

  const saveM = useMutation({
    mutationFn: () => tenants.update(tenantId!, { features }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'current'] }),
  });

  if (tenantQ.isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader title="Модулі клініки" description="Увімкніть або вимкніть функції" />
      <Card>
        <div className="space-y-2">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between border-b border-slate-100 py-2">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={!!features[key]}
                onChange={(e) => setFeatures((f) => ({ ...f, [key]: e.target.checked }))}
                className="h-5 w-5"
              />
            </label>
          ))}
        </div>
        <div className="mt-4">
          <Button onClick={() => saveM.mutate()} isLoading={saveM.isPending}>
            Зберегти
          </Button>
        </div>
      </Card>
    </div>
  );
};
