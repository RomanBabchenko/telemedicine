import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '@telemed/api-client';
import type { UserDetailDto } from '@telemed/shared-types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
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
import { useAuthStore } from '../../stores/auth.store';
import { AddMembershipModal } from './AddMembershipModal';

const adminUsers = adminUsersApi(apiClient);

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

export const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const isPlatformAdmin = useAuthStore(
    (s) => s.user?.roles?.includes('PLATFORM_SUPER_ADMIN') ?? false,
  );
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);

  const userQ = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => adminUsers.getById(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-user', id] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const setStatusM = useMutation({
    mutationFn: (st: 'ACTIVE' | 'BLOCKED') => adminUsers.setStatus(id!, st),
    onSuccess: () => invalidate(),
  });

  const resetPasswordM = useMutation({
    mutationFn: () => adminUsers.resetPassword(id!),
    onSuccess: (res) => setTempPassword(res.temporaryPassword),
  });

  const revokeM = useMutation({
    mutationFn: (membershipId: string) =>
      adminUsers.revokeMembership(id!, membershipId),
    onSuccess: () => invalidate(),
  });

  const setDefaultM = useMutation({
    mutationFn: (membershipId: string) =>
      adminUsers.setDefaultMembership(id!, membershipId),
    onSuccess: () => invalidate(),
  });

  if (userQ.isLoading) return <Spinner />;
  if (userQ.isError) return <Alert variant="danger">{errorMessage(userQ.error)}</Alert>;
  const user = userQ.data;
  if (!user) return <Alert variant="warning">Користувача не знайдено</Alert>;

  return (
    <div className="space-y-6">
      <Link to="/users" className="text-sm text-blue-700 hover:underline">
        ← Користувачі
      </Link>

      <PageHeader
        title={fullName(user)}
        description={[user.email, user.phone].filter(Boolean).join(' · ')}
        actions={
          user.status === 'ACTIVE' ? (
            <Button
              variant="danger"
              isLoading={setStatusM.isPending}
              onClick={() => setStatusM.mutate('BLOCKED')}
            >
              Заблокувати
            </Button>
          ) : (
            <Button
              variant="primary"
              isLoading={setStatusM.isPending}
              onClick={() => setStatusM.mutate('ACTIVE')}
            >
              Активувати
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Профіль</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Імʼя</dt>
              <dd>{user.firstName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Прізвище</dt>
              <dd>{user.lastName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Email</dt>
              <dd>{user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Телефон</dt>
              <dd>{user.phone ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Статус</dt>
              <dd>
                <Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {user.status}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">MFA</dt>
              <dd>{user.mfaEnabled ? 'увімкнено' : 'вимкнено'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Безпека</h3>
          <p className="mb-3 text-sm text-slate-600">
            Згенерувати тимчасовий пароль. Користувач має змінити його при
            першому вході.
          </p>
          <Button
            variant="outline"
            isLoading={resetPasswordM.isPending}
            onClick={() => resetPasswordM.mutate()}
          >
            Скинути пароль
          </Button>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Ролі та клініки</h3>
          <Button size="sm" onClick={() => setAddMembershipOpen(true)}>
            + Додати роль
          </Button>
        </div>
        {user.memberships.length === 0 ? (
          <p className="text-sm text-slate-500">
            У користувача поки немає жодної ролі.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Клініка</TH>
                <TH>Роль</TH>
                <TH>За замовчуванням</TH>
                <TH>Дії</TH>
              </TR>
            </THead>
            <TBody>
              {user.memberships.map((m) => (
                <TR key={m.id}>
                  <TD>{m.tenantName ?? m.tenantId.slice(0, 8) + '…'}</TD>
                  <TD>
                    <Badge>{m.role}</Badge>
                  </TD>
                  <TD>
                    {m.isDefault ? (
                      <Badge variant="success">так</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={setDefaultM.isPending}
                        onClick={() => setDefaultM.mutate(m.id)}
                      >
                        зробити default
                      </Button>
                    )}
                  </TD>
                  <TD>
                    <Button
                      size="sm"
                      variant="danger"
                      isLoading={revokeM.isPending}
                      onClick={() => revokeM.mutate(m.id)}
                    >
                      Видалити
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {revokeM.isError ? (
          <div className="mt-3">
            <Alert variant="danger">{errorMessage(revokeM.error)}</Alert>
          </div>
        ) : null}
      </Card>

      <Modal
        open={tempPassword !== null}
        onClose={() => setTempPassword(null)}
        title="Тимчасовий пароль"
        footer={
          <Button onClick={() => setTempPassword(null)}>Закрити</Button>
        }
      >
        <div className="space-y-3">
          <Alert variant="success">
            Пароль скинуто. Передайте користувачеві захищеним каналом:
          </Alert>
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm">
            {tempPassword}
          </div>
        </div>
      </Modal>

      <AddMembershipModal
        open={addMembershipOpen}
        onClose={() => setAddMembershipOpen(false)}
        userId={id!}
        platformActor={isPlatformAdmin}
        onSuccess={() => {
          invalidate();
          setAddMembershipOpen(false);
        }}
      />
    </div>
  );
};
