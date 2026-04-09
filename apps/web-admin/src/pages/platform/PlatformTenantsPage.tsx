import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@telemed/api-client';
import type { CreateTenantDto } from '@telemed/shared-types';
import {
  Alert,
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
import { TenantFormModal } from './TenantFormModal';

const admin = adminApi(apiClient);

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

export const PlatformTenantsPage = () => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const tenantsQ = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => admin.listTenants(),
  });

  const createM = useMutation({
    mutationFn: (dto: CreateTenantDto) => admin.createTenant(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      setModalOpen(false);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Клініки платформи"
        description="Усі клініки, які підключені до Telemed"
        actions={<Button onClick={() => setModalOpen(true)}>Створити клініку</Button>}
      />

      {tenantsQ.isLoading ? (
        <Spinner />
      ) : tenantsQ.isError ? (
        <Alert variant="danger">{errorMessage(tenantsQ.error)}</Alert>
      ) : (tenantsQ.data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки немає клінік" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Назва</TH>
              <TH>Slug</TH>
              <TH>Поддомен</TH>
              <TH>Локаль</TH>
              <TH>Валюта</TH>
              <TH>Дії</TH>
            </TR>
          </THead>
          <TBody>
            {tenantsQ.data?.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link
                    to={`/platform/tenants/${t.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {t.brandName}
                  </Link>
                </TD>
                <TD>
                  <code className="text-xs">{t.slug}</code>
                </TD>
                <TD>
                  <code className="text-xs">{t.subdomain}</code>
                </TD>
                <TD>
                  <Badge>{t.locale}</Badge>
                </TD>
                <TD>{t.currency}</TD>
                <TD>
                  <Link to={`/platform/tenants/${t.id}`}>
                    <Button size="sm" variant="secondary">
                      Редагувати
                    </Button>
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <TenantFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(dto) => createM.mutate(dto)}
        isPending={createM.isPending}
        error={createM.error}
      />
    </div>
  );
};
