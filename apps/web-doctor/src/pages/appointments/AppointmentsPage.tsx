import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

export const AppointmentsPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['appointments-doctor'],
    queryFn: () => booking.list(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Прийоми" description="Усі ваші заплановані візити" />
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки немає прийомів" />
      ) : (
        <div className="space-y-3">
          {data?.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</p>
                  <Badge>{a.status}</Badge>
                  {a.reasonText ? <p className="mt-1 text-sm text-slate-500">{a.reasonText}</p> : null}
                </div>
                <Link to={`/consultation/${a.consultationSessionId ?? a.id}`}>
                  <Button size="sm">Відкрити</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
