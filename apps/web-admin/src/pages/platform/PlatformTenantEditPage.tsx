import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, adminUsersApi } from '@telemed/api-client';
import type {
  TenantFeatureMatrix,
  UpdateTenantDto,
  UserDetailDto,
} from '@telemed/shared-types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
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

const admin = adminApi(apiClient);
const adminUsers = adminUsersApi(apiClient);

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

const FEATURE_LABELS: Record<keyof TenantFeatureMatrix, string> = {
  b2cListing: 'B2C каталог',
  bookingWidget: 'Віджет бронювання',
  embeddedConsultation: 'Вбудована консультація',
  prescriptionModule: 'Модуль рецептів',
  analyticsPackage: 'Аналітика',
  brandedPatientPortal: 'Брендований портал пацієнта',
  misSync: 'Синхронізація з МІС',
  advancedReports: 'Розширені звіти',
  audioArchive: 'Архів аудіо',
  apiAccess: 'Доступ до API',
};

export const PlatformTenantEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const tenantQ = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: async () => {
      const all = await admin.listTenants();
      return all.find((t) => t.id === id) ?? null;
    },
    enabled: !!id,
  });

  const usersQ = useQuery({
    queryKey: ['admin-users', { tenantId: id }],
    // We re-use the existing list endpoint, but the scope here is implicit:
    // PLATFORM_SUPER_ADMIN with scope='all' returns everyone — we filter on
    // client side because there's no per-tenant filter in the API yet.
    queryFn: () => adminUsers.list({ scope: 'all', pageSize: 100 }),
    enabled: !!id,
  });

  const usersInThisTenant =
    usersQ.data?.items.filter((u) =>
      u.memberships.some((m) => m.tenantId === id),
    ) ?? [];

  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1f7ae0');
  const [logoUrl, setLogoUrl] = useState('');
  const [locale, setLocale] = useState('uk');
  const [features, setFeatures] = useState<TenantFeatureMatrix | null>(null);

  useEffect(() => {
    const t = tenantQ.data;
    if (t) {
      setBrandName(t.brandName);
      setPrimaryColor(t.primaryColor);
      setLogoUrl(t.logoUrl ?? '');
      setLocale(t.locale);
      setFeatures(t.features);
    }
  }, [tenantQ.data]);

  const updateM = useMutation({
    mutationFn: (dto: UpdateTenantDto) => admin.updateTenant(id!, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-tenant', id] });
    },
  });

  if (tenantQ.isLoading) return <Spinner />;
  if (tenantQ.isError)
    return <Alert variant="danger">{errorMessage(tenantQ.error)}</Alert>;
  const tenant = tenantQ.data;
  if (!tenant) return <Alert variant="warning">Клініка не знайдена</Alert>;

  const toggleFeature = (key: keyof TenantFeatureMatrix) => {
    if (!features) return;
    setFeatures({ ...features, [key]: !features[key] });
  };

  const save = () => {
    updateM.mutate({
      brandName,
      primaryColor,
      logoUrl: logoUrl || null,
      locale,
      features: features ?? undefined,
    });
  };

  return (
    <div className="space-y-6">
      <Link to="/platform/tenants" className="text-sm text-blue-700 hover:underline">
        ← Клініки
      </Link>

      <PageHeader
        title={tenant.brandName}
        description={`${tenant.subdomain} · ${tenant.locale} · ${tenant.currency}`}
      />

      <Card>
        <h3 className="mb-3 font-semibold">Брендинг</h3>
        <FormField label="Назва">
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </FormField>
        <FormField label="Основний колір">
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
          />
        </FormField>
        <FormField label="URL логотипу">
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </FormField>
        <FormField label="Локаль">
          <Input value={locale} onChange={(e) => setLocale(e.target.value)} />
        </FormField>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Модулі (feature flags)</h3>
        {features ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(FEATURE_LABELS) as Array<keyof TenantFeatureMatrix>).map(
              (key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={features[key]}
                    onChange={() => toggleFeature(key)}
                  />
                  {FEATURE_LABELS[key]}
                </label>
              ),
            )}
          </div>
        ) : null}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} isLoading={updateM.isPending}>
          Зберегти зміни
        </Button>
        {updateM.isSuccess ? <Alert variant="success">Збережено</Alert> : null}
        {updateM.isError ? (
          <Alert variant="danger">{errorMessage(updateM.error)}</Alert>
        ) : null}
      </div>

      <Card>
        <h3 className="mb-3 font-semibold">Користувачі цієї клініки</h3>
        {usersQ.isLoading ? (
          <Spinner />
        ) : usersInThisTenant.length === 0 ? (
          <EmptyState title="У клініці поки немає користувачів" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>ПІБ</TH>
                <TH>Email</TH>
                <TH>Ролі в клініці</TH>
                <TH>Статус</TH>
              </TR>
            </THead>
            <TBody>
              {usersInThisTenant.map((u: UserDetailDto) => (
                <TR key={u.id}>
                  <TD>
                    <Link
                      to={`/users/${u.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—'}
                    </Link>
                  </TD>
                  <TD>{u.email ?? '—'}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {u.memberships
                        .filter((m) => m.tenantId === id)
                        .map((m) => (
                          <Badge key={m.id}>{m.role}</Badge>
                        ))}
                    </div>
                  </TD>
                  <TD>
                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {u.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

