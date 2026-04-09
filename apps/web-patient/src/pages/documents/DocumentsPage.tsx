import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { patientsApi } from '@telemed/api-client';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const patients = patientsApi(apiClient);

export const DocumentsPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => patients.myDocuments(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Мої медичні документи" />
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Документів поки немає" />
      ) : (
        <div className="space-y-3">
          {data?.map((d) => (
            <Card key={d.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{d.type}</p>
                  <p className="text-sm text-slate-500">
                    {dayjs(d.createdAt).format('DD.MM.YYYY')}
                  </p>
                </div>
                <Badge variant={d.status === 'SIGNED' ? 'success' : 'default'}>{d.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
