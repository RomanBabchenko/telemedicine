import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApi, adminUsersApi } from '@telemed/api-client';
import type { AddMembershipDto, Role } from '@telemed/shared-types';
import {
  Alert,
  Button,
  FormField,
  Modal,
  Select,
} from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const adminUsers = adminUsersApi(apiClient);
const admin = adminApi(apiClient);

const ROLE_OPTIONS_CLINIC: Array<{ value: Role; label: string }> = [
  { value: 'PATIENT', label: 'Пацієнт' },
  { value: 'DOCTOR', label: 'Лікар' },
  { value: 'CLINIC_OPERATOR', label: 'Оператор клініки' },
  { value: 'CLINIC_ADMIN', label: 'Адмін клініки' },
];

const ROLE_OPTIONS_PLATFORM: Array<{ value: Role; label: string }> = [
  ...ROLE_OPTIONS_CLINIC,
  { value: 'PLATFORM_SUPER_ADMIN', label: 'Супер-адмін платформи' },
  { value: 'PLATFORM_SUPPORT', label: 'Підтримка платформи' },
  { value: 'PLATFORM_FINANCE', label: 'Фінансист платформи' },
  { value: 'AUDITOR', label: 'Аудитор' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  platformActor: boolean;
  onSuccess: () => void;
}

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

export const AddMembershipModal = ({
  open,
  onClose,
  userId,
  platformActor,
  onSuccess,
}: Props) => {
  const ownTenantId = useAuthStore((s) => s.tenantId);
  const [tenantId, setTenantId] = useState<string>('');
  const [role, setRole] = useState<Role>('PATIENT');
  const [isDefault, setIsDefault] = useState(false);

  // PLATFORM_SUPER_ADMIN can pick any tenant.
  const tenantsQ = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => admin.listTenants(),
    enabled: open && platformActor,
  });

  useEffect(() => {
    if (!open) {
      setTenantId('');
      setRole('PATIENT');
      setIsDefault(false);
      return;
    }
    if (!platformActor && ownTenantId) {
      setTenantId(ownTenantId);
    }
  }, [open, platformActor, ownTenantId]);

  const addM = useMutation({
    mutationFn: (dto: AddMembershipDto) => adminUsers.addMembership(userId, dto),
    onSuccess: () => onSuccess(),
  });

  const ROLE_OPTIONS = platformActor ? ROLE_OPTIONS_PLATFORM : ROLE_OPTIONS_CLINIC;

  const submit = () => {
    if (!tenantId) return;
    addM.mutate({ tenantId, role, isDefault });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Додати роль користувачеві"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={addM.isPending}>
            Скасувати
          </Button>
          <Button onClick={submit} isLoading={addM.isPending} disabled={!tenantId}>
            Додати
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        {addM.isError ? (
          <Alert variant="danger">{errorMessage(addM.error)}</Alert>
        ) : null}

        {platformActor ? (
          <FormField label="Клініка">
            <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">— Виберіть клініку —</option>
              {(tenantsQ.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.brandName}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <FormField label="Клініка" hint="Поточна клініка адміністратора">
            <Select value={tenantId} disabled>
              <option value={ownTenantId ?? ''}>Поточна клініка</option>
            </Select>
          </FormField>
        )}

        <FormField label="Роль">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Зробити цей tenant за замовчуванням для користувача
        </label>
      </div>
    </Modal>
  );
};
