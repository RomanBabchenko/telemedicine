import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '@telemed/api-client';
import { Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const patients = patientsApi(apiClient);

export const ProfilePage = () => {
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => patients.me() });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader title="Профіль" />
      <Card>
        <p>
          <strong>
            {[data.firstName, data.lastName].filter(Boolean).join(' ') || '—'}
          </strong>
        </p>
        <p>{data.email ?? '—'}</p>
        <p>{data.phone ?? '—'}</p>
        <p className="text-sm text-slate-500">Мова: {data.preferredLocale}</p>
      </Card>
    </div>
  );
};
