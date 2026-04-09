import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { paymentsApi } from '@telemed/api-client';
import { Card, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const payments = paymentsApi(apiClient);

export const BillingPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const ledgerQ = useQuery({
    queryKey: ['ledger', tenantId],
    queryFn: () => payments.tenantLedger(tenantId!),
    enabled: !!tenantId,
  });
  const invoicesQ = useQuery({
    queryKey: ['invoices', tenantId],
    queryFn: () => payments.tenantInvoices(tenantId!),
    enabled: !!tenantId,
  });

  if (ledgerQ.isLoading || invoicesQ.isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader title="Білінг" description="Реєстр операцій та інвойси" />
      <Card>
        <h3 className="mb-3 font-semibold">Реєстр операцій (ledger)</h3>
        {(ledgerQ.data?.length ?? 0) === 0 ? (
          <EmptyState title="Поки немає операцій" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Дата</TH>
                <TH>Рахунок</TH>
                <TH>Дебет</TH>
                <TH>Кредит</TH>
                <TH>Memo</TH>
              </TR>
            </THead>
            <TBody>
              {ledgerQ.data?.map((e) => (
                <TR key={e.id}>
                  <TD>{dayjs(e.createdAt).format('DD.MM HH:mm')}</TD>
                  <TD>{e.account}</TD>
                  <TD>{Number(e.debit) || ''}</TD>
                  <TD>{Number(e.credit) || ''}</TD>
                  <TD>{e.memo}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Інвойси</h3>
        {(invoicesQ.data?.length ?? 0) === 0 ? (
          <EmptyState title="Інвойсів ще немає" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Період</TH>
                <TH>Сума</TH>
                <TH>Статус</TH>
              </TR>
            </THead>
            <TBody>
              {invoicesQ.data?.map((i) => (
                <TR key={i.id}>
                  <TD>
                    {dayjs(i.periodStart).format('DD.MM')}—{dayjs(i.periodEnd).format('DD.MM.YYYY')}
                  </TD>
                  <TD>{i.totalAmount} ₴</TD>
                  <TD>{i.status}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
};
