import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { paymentsApi } from '@telemed/api-client';
import {
  Card,
  EmptyState,
  PageHeader,
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

  const ledger = useTableControls(ledgerQ.data, {
    sortValues: {
      date: (e) => e.createdAt,
      debit: (e) => Number(e.debit) || 0,
      credit: (e) => Number(e.credit) || 0,
    },
    initialSort: { field: 'date', dir: 'desc' },
  });

  const invoices = useTableControls(invoicesQ.data, {
    sortValues: {
      period: (i) => i.periodStart,
      amount: (i) => Number(i.totalAmount),
    },
    initialSort: { field: 'period', dir: 'desc' },
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
                <SortableTH active={ledger.sortActive('date')} onSort={() => ledger.toggleSort('date')}>
                  Дата
                </SortableTH>
                <TH>Рахунок</TH>
                <SortableTH active={ledger.sortActive('debit')} onSort={() => ledger.toggleSort('debit')}>
                  Дебет
                </SortableTH>
                <SortableTH active={ledger.sortActive('credit')} onSort={() => ledger.toggleSort('credit')}>
                  Кредит
                </SortableTH>
                <TH>Memo</TH>
              </TR>
            </THead>
            <TBody>
              {ledger.rows.map((e) => (
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
                <SortableTH
                  active={invoices.sortActive('period')}
                  onSort={() => invoices.toggleSort('period')}
                >
                  Період
                </SortableTH>
                <SortableTH
                  active={invoices.sortActive('amount')}
                  onSort={() => invoices.toggleSort('amount')}
                >
                  Сума
                </SortableTH>
                <TH>Статус</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.rows.map((i) => (
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
