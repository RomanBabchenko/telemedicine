import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { auditApi } from '@telemed/api-client';
import type { AuditEventQuery } from '@telemed/shared-types';
import {
  Card,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@telemed/ui';
import { useDebouncedValue } from '@telemed/web-shared';
import { apiClient } from '../../lib/api';

const audit = auditApi(apiClient);

const PAGE_SIZE = 50;

export const AuditPage = () => {
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const debouncedAction = useDebouncedValue(action);
  const debouncedResourceType = useDebouncedValue(resourceType);

  // Filter changes restart pagination from the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedAction, debouncedResourceType, from, to]);

  const query: AuditEventQuery = {
    page,
    pageSize: PAGE_SIZE,
    action: debouncedAction.trim() || undefined,
    resourceType: debouncedResourceType.trim() || undefined,
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['audit-events', query],
    queryFn: () => audit.list(query),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Аудит" description="Хто, що і коли робив" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <FormField label="Дія">
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Наприклад: user.login"
          />
        </FormField>
        <FormField label="Тип ресурсу">
          <Input
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            placeholder="Наприклад: appointment"
          />
        </FormField>
        <FormField label="Від">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label="До">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : (data?.items.length ?? 0) === 0 ? (
          <EmptyState title="Подій ще немає" />
        ) : (
          <>
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
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
};
