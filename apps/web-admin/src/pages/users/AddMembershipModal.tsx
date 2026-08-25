import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApi, adminUsersApi } from '@telemed/api-client';
import { ROLE_LABELS, isPlatformActor, manageableRolesFor } from '@telemed/shared-types';
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

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
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
  onSuccess,
}: Props) => {
  const ownTenantId = useAuthStore((s) => s.tenantId);
  const actorRoles = useAuthStore((s) => s.user?.roles);
  const platformActor = isPlatformActor(actorRoles);
  // Options derive from MANAGEABLE_ROLES (shared-types) — same matrix the
  // API enforces, so INTEGRATION_ADMIN only ever sees IA / CMO here.
  const ROLE_OPTIONS = manageableRolesFor(actorRoles).map((value) => ({
    value,
    label: ROLE_LABELS[value],
  }));
  const defaultRole: Role = ROLE_OPTIONS[0]?.value ?? 'PATIENT';
  const [tenantId, setTenantId] = useState<string>('');
  const [role, setRole] = useState<Role>(defaultRole);
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
      setRole(defaultRole);
      setIsDefault(false);
      return;
    }
    if (!platformActor && ownTenantId) {
      setTenantId(ownTenantId);
    }
  }, [open, platformActor, ownTenantId, defaultRole]);

  const addM = useMutation({
    mutationFn: (dto: AddMembershipDto) => adminUsers.addMembership(userId, dto),
    onSuccess: () => onSuccess(),
  });

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
