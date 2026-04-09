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
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@telemed/ui';
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
        <EmptyState
          title="Поки що немає консультацій"
          description="Перейдіть до списку лікарів і запишіться на прийом."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Дата</TH>
              <TH>Лікар</TH>
              <TH>Спеціалізація</TH>
              <TH>Статус</TH>
              <TH>Дії</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((a) => (
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
    </div>
  );
};
