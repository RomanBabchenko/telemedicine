import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '@telemed/api-client';
import type { CreateUserDto, ListUsersQuery, Role, UserDetailDto } from '@telemed/shared-types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { UserFormModal } from './UserFormModal';

const adminUsers = adminUsersApi(apiClient);

const ROLE_OPTIONS: Array<{ value: '' | Role; label: string }> = [
  { value: '', label: 'Усі ролі' },
  { value: 'PATIENT', label: 'Пацієнт' },
  { value: 'DOCTOR', label: 'Лікар' },
  { value: 'CLINIC_OPERATOR', label: 'Оператор' },
  { value: 'CLINIC_ADMIN', label: 'Адмін клініки' },
  { value: 'PLATFORM_SUPER_ADMIN', label: 'Супер-адмін платформи' },
  { value: 'PLATFORM_SUPPORT', label: 'Підтримка платформи' },
  { value: 'PLATFORM_FINANCE', label: 'Фінансист платформи' },
  { value: 'AUDITOR', label: 'Аудитор' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Усі статуси' },
  { value: 'ACTIVE', label: 'Активний' },
  { value: 'BLOCKED', label: 'Заблокований' },
  { value: 'PENDING', label: 'Очікує' },
];

const fullName = (u: UserDetailDto): string =>
  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '—';

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

interface Props {
  scope: 'mine' | 'all';
}

export const UsersPage = ({ scope }: Props) => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | Role>('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'BLOCKED' | 'PENDING'>('');

  const query: ListUsersQuery = {
    pageSize: 100,
    scope,
    search: search.trim() || undefined,
    role: (role || undefined) as Role | undefined,
    status: (status || undefined) as 'ACTIVE' | 'BLOCKED' | 'PENDING' | undefined,
  };

  const listQ = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => adminUsers.list(query),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const createM = useMutation({
    mutationFn: (dto: CreateUserDto) => adminUsers.create(dto),
    onSuccess: (result) => {
      invalidate();
      // If a temp password was generated — show it. UserFormModal will read this.
      setLastTempPassword(result.generatedPassword ?? null);
      if (!result.generatedPassword) {
        setModalOpen(false);
      }
    },
  });

  const setStatusM = useMutation({
    mutationFn: ({ id, st }: { id: string; st: 'ACTIVE' | 'BLOCKED' }) =>
      adminUsers.setStatus(id, st),
    onSuccess: () => invalidate(),
  });

  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={scope === 'all' ? 'Усі користувачі (платформа)' : 'Користувачі клініки'}
        actions={<Button onClick={() => setModalOpen(true)}>Додати користувача</Button>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Пошук">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ПІБ або email"
          />
        </FormField>
        <FormField label="Роль">
          <Select value={role} onChange={(e) => setRole(e.target.value as '' | Role)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Статус">
          <Select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as '' | 'ACTIVE' | 'BLOCKED' | 'PENDING')
            }
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {listQ.isLoading ? (
        <Spinner />
      ) : listQ.isError ? (
        <Alert variant="danger">{errorMessage(listQ.error)}</Alert>
      ) : (listQ.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Користувачі не знайдені" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>ПІБ</TH>
              <TH>Email</TH>
              <TH>Ролі</TH>
              <TH>Статус</TH>
              <TH>Дії</TH>
            </TR>
          </THead>
          <TBody>
            {listQ.data?.items.map((u) => (
              <TR key={u.id}>
                <TD>
                  <Link to={`/users/${u.id}`} className="text-blue-700 hover:underline">
                    {fullName(u)}
                  </Link>
                </TD>
                <TD>{u.email ?? '—'}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {u.memberships.map((m) => (
                      <Badge
                        key={m.id}
                        variant={m.isDefault ? 'success' : 'default'}
                      >
                        {m.role}
                        {scope === 'all' && m.tenantName ? ` · ${m.tenantName}` : ''}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>
                  <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {u.status}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex gap-2">
                    <Link to={`/users/${u.id}`}>
                      <Button size="sm" variant="secondary">
                        Деталі
                      </Button>
                    </Link>
                    {u.status === 'ACTIVE' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        isLoading={
                          setStatusM.isPending && setStatusM.variables?.id === u.id
                        }
                        onClick={() =>
                          setStatusM.mutate({ id: u.id, st: 'BLOCKED' })
                        }
                      >
                        Заблокувати
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        isLoading={
                          setStatusM.isPending && setStatusM.variables?.id === u.id
                        }
                        onClick={() =>
                          setStatusM.mutate({ id: u.id, st: 'ACTIVE' })
                        }
                      >
                        Активувати
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <UserFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setLastTempPassword(null);
          createM.reset();
        }}
        onSubmit={(dto) => createM.mutate(dto)}
        isPending={createM.isPending}
        error={createM.error}
        generatedPassword={lastTempPassword}
        platformActor={scope === 'all'}
      />
    </div>
  );
};
