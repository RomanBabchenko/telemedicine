import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from '@telemed/ui';
import { useTableControls } from '@telemed/web-shared';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

export const AppointmentsPage = () => {
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['appointments-doctor'],
    queryFn: () => booking.list(),
  });

  const statuses = useMemo(
    () => Array.from(new Set((data ?? []).map((a) => a.status))).sort(),
    [data],
  );

  const { rows, sortDir, toggleSort } = useTableControls(data, {
    sortValues: { startAt: (a) => a.startAt },
    filter: (a) => !statusFilter || a.status === statusFilter,
    initialSort: { field: 'startAt', dir: 'desc' },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Прийоми" description="Усі ваші заплановані візити" />
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки немає прийомів" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select
                aria-label="Фільтр за статусом"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Усі статуси</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => toggleSort('startAt')}>
              {sortDir === 'desc' ? 'Спочатку нові ↓' : 'Спочатку старі ↑'}
            </Button>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Нічого не знайдено" description="Спробуйте інший фільтр." />
          ) : (
            <div className="space-y-3">
              {rows.map((a) => (
                <Card key={a.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</p>
                      <Badge>{a.status}</Badge>
                      {a.reasonText ? (
                        <p className="mt-1 text-sm text-slate-500">{a.reasonText}</p>
                      ) : null}
                    </div>
                    <Link to={`/consultation/${a.consultationSessionId ?? a.id}`}>
                      <Button size="sm">Відкрити</Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
