import { useQuery } from '@tanstack/react-query';
import { doctorsApi } from '@telemed/api-client';
import { Badge, Card, EmptyState, PageHeader, Spinner, Table, TBody, TD, TH, THead, TR } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const doctors = doctorsApi(apiClient);

export const DoctorsPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-doctors'],
    queryFn: () => doctors.search({ pageSize: 100 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Лікарі клініки" />
      {isLoading ? (
        <Spinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="У клініці поки немає лікарів" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Лікар</TH>
              <TH>Спеціальність</TH>
              <TH>Стаж</TH>
              <TH>Ціна</TH>
              <TH>Статус</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((d) => (
              <TR key={d.id}>
                <TD>{d.firstName} {d.lastName}</TD>
                <TD>{d.specializations.join(', ')}</TD>
                <TD>{d.yearsOfExperience} років</TD>
                <TD>{d.basePrice} ₴</TD>
                <TD>
                  <Badge variant={d.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>
                    {d.verificationStatus}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
};
