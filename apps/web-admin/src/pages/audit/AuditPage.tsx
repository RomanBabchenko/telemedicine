import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { auditApi } from '@telemed/api-client';
import { Card, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const audit = auditApi(apiClient);

export const AuditPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-events'],
    queryFn: () => audit.list({ pageSize: 100 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Аудит" description="Хто, що і коли робив" />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Подій ще немає" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Час</TH>
                <TH>Користувач</TH>
                <TH>Дія</TH>
                <TH>Ресурс</TH>
                <TH>IP</TH>
              </TR>
            </THead>
            <TBody>
              {data?.items.map((e) => (
                <TR key={e.id}>
                  <TD>{dayjs(e.createdAt).format('DD.MM HH:mm:ss')}</TD>
                  <TD>{e.actorUserId?.slice(0, 8) ?? '—'}</TD>
                  <TD>{e.action}</TD>
                  <TD>
                    {e.resourceType} {e.resourceId?.slice(0, 8) ?? ''}
                  </TD>
                  <TD>{e.ip ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
};
