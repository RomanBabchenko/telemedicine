import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { Badge, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

const fullName = (first?: string, last?: string): string => {
  const value = `${first ?? ''} ${last ?? ''}`.trim();
  return value || '—';
};

export const AppointmentsPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-appointments'],
    queryFn: () => booking.list(),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Прийоми клініки" />
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки немає прийомів" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Дата</TH>
              <TH>Пацієнт</TH>
              <TH>Телефон</TH>
              <TH>Лікар</TH>
              <TH>Спеціальність</TH>
              <TH>Статус</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((a) => (
              <TR key={a.id}>
                <TD>{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</TD>
                <TD>{fullName(a.patient?.firstName, a.patient?.lastName)}</TD>
                <TD>{a.patient?.phone ?? '—'}</TD>
                <TD>{fullName(a.doctor?.firstName, a.doctor?.lastName)}</TD>
                <TD>{a.doctor?.specializations?.join(', ') || '—'}</TD>
                <TD>
                  <Badge>{a.status}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
};
