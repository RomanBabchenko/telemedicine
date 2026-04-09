import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { Badge, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);

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
              <TH>Лікар</TH>
              <TH>Статус</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((a) => (
              <TR key={a.id}>
                <TD>{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</TD>
                <TD>{a.patientId.slice(0, 8)}…</TD>
                <TD>{a.doctorId.slice(0, 8)}…</TD>
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
