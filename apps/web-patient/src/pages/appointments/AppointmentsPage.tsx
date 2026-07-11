import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import type { AppointmentDto } from '@telemed/shared-types';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Select,
  SortableTH,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@telemed/ui';
import { useTableControls } from '@telemed/web-shared';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

const doctorName = (a: AppointmentDto): string => {
  const first = a.doctor?.firstName ?? '';
  const last = a.doctor?.lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full || 'Лікар';
};

const doctorSpecs = (a: AppointmentDto): string =>
  a.doctor?.specializations?.join(', ') ?? '';

export const AppointmentsPage = () => {
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => booking.list(),
  });

  const statuses = useMemo(
    () => Array.from(new Set((data ?? []).map((a) => a.status))).sort(),
    [data],
  );

  const { rows, toggleSort, sortActive } = useTableControls(data, {
    sortValues: { startAt: (a) => a.startAt },
    filter: (a) => !statusFilter || a.status === statusFilter,
    initialSort: { field: 'startAt', dir: 'desc' },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Мої консультації" />
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Поки що немає консультацій"
          description="Перейдіть до списку лікарів і запишіться на прийом."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
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
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Нічого не знайдено" description="Спробуйте інший фільтр." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <SortableTH active={sortActive('startAt')} onSort={() => toggleSort('startAt')}>
                    Дата
                  </SortableTH>
                  <TH>Лікар</TH>
                  <TH>Спеціалізація</TH>
                  <TH>Статус</TH>
                  <TH>Дії</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((a) => (
                  <TR key={a.id}>
                    <TD>{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</TD>
                    <TD>{doctorName(a)}</TD>
                    <TD>{doctorSpecs(a) || '—'}</TD>
                    <TD>
                      <Badge>{a.status}</Badge>
                    </TD>
                    <TD>
                      <Link to={`/appointments/${a.id}/join`}>
                        <Button size="sm">Підключитись</Button>
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
};
