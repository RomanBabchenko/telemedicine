import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

export const AppointmentsPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => booking.list(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Мої консультації" />
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки що немає консультацій" description="Перейдіть до списку лікарів і запишіться на прийом." />
      ) : (
        <div className="space-y-3">
          {data?.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</p>
                  <Badge>{a.status}</Badge>
                </div>
                <Link to={`/appointments/${a.id}/join`}>
                  <Button size="sm">Підключитись</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
