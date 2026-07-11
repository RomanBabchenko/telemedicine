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
  FormField,
  Input,
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
  const [search, setSearch] = useState('');

  const tenantsQ = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => admin.listTenants(),
  });

  const needle = search.trim().toLowerCase();
  const { rows, toggleSort, sortActive } = useTableControls(tenantsQ.data, {
    sortValues: {
      name: (t) => t.brandName,
      slug: (t) => t.slug,
    },
    filter: (t) =>
      !needle ||
      t.brandName.toLowerCase().includes(needle) ||
      t.slug.toLowerCase().includes(needle),
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Пошук">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Назва або slug"
          />
        </FormField>
      </div>

      {tenantsQ.isLoading ? (
        <Spinner />
      ) : tenantsQ.isError ? (
        <Alert variant="danger">{errorMessage(tenantsQ.error)}</Alert>
      ) : (tenantsQ.data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки немає клінік" />
      ) : rows.length === 0 ? (
        <EmptyState title="Нічого не знайдено за пошуком" />
      ) : (
        <Table>
          <THead>
            <TR>
              <SortableTH active={sortActive('name')} onSort={() => toggleSort('name')}>
                Назва
              </SortableTH>
              <SortableTH active={sortActive('slug')} onSort={() => toggleSort('slug')}>
                Slug
              </SortableTH>
              <TH>Поддомен</TH>
              <TH>Локаль</TH>
              <TH>Валюта</TH>
              <TH>Дії</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((t) => (
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
