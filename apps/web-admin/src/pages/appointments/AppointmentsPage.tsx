import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi, consultationApi } from '@telemed/api-client';
import { Badge, Button, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const booking = bookingApi(apiClient);
const consultation = consultationApi(apiClient);

const fullName = (first?: string, last?: string): string => {
  const value = `${first ?? ''} ${last ?? ''}`.trim();
  return value || '—';
};

const RecordingCell = ({ sessionId }: { sessionId: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await consultation.getRecording(sessionId);
      if (res.downloadUrl) {
        setUrl(res.downloadUrl);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (notFound) return <span className="text-sm text-gray-400">—</span>;

  if (url) {
    return (
      <audio controls preload="none" className="h-8 w-48">
        <source src={url} type="audio/ogg" />
      </audio>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} disabled={loading}>
      {loading ? '...' : 'Прослухати'}
    </Button>
  );
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
              <TH>Запис</TH>
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
                <TD>
                  {a.consultationSessionId ? (
                    <RecordingCell sessionId={a.consultationSessionId} />
                  ) : (
                    '—'
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
};
