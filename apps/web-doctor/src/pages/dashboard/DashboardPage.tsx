import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Stat } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

export const DashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['my-appointments'],
    queryFn: () => booking.list(),
  });

  if (isLoading) return <Spinner />;
  const today = data?.filter((a) => dayjs(a.startAt).isSame(dayjs(), 'day')) ?? [];
  const upcoming = data?.filter((a) => dayjs(a.startAt).isAfter(dayjs())) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Дашборд" description="Огляд сьогоднішнього дня" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Сьогодні" value={today.length} />
        <Stat label="Найближчі" value={upcoming.length} />
        <Stat label="Усього" value={data?.length ?? 0} />
      </div>
      <Card>
        <h3 className="mb-3 text-base font-semibold">Найближчі прийоми</h3>
        {upcoming.length === 0 ? (
          <EmptyState title="Немає запланованих прийомів" />
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="font-medium">{dayjs(a.startAt).format('DD.MM HH:mm')}</p>
                  <Badge>{a.status}</Badge>
                </div>
                <Link to={`/consultation/${a.consultationSessionId ?? a.id}`}>
                  <Button size="sm">Відкрити</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
