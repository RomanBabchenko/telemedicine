import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '@telemed/api-client';
import { FEATURE_LABELS, TenantFeatureKey } from '@telemed/shared-types';
import { Alert, Badge, Button, Card, FormField, Input, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const tenants = tenantsApi(apiClient);

// Flags without server-side enforcement yet (POC) — they only describe the
// stored matrix, not behavior.
const DECORATIVE: ReadonlySet<string> = new Set([
  'embeddedConsultation',
  'brandedPatientPortal',
  'advancedReports',
]);

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : 'Сталася помилка';

// Which modules a clinic has is decided by the platform (PATCH `features` is
// PLATFORM_SUPER_ADMIN-only). The clinic tunes what's inside them — here,
// whether consultations are recorded and for how long the files are kept.
export const FeaturesPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const qc = useQueryClient();
  const tenantQ = useQuery({ queryKey: ['tenant', 'current'], queryFn: () => tenants.current() });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    const t = tenantQ.data;
    if (t) {
      // Missing `enabled` = OFF (auto-recording is opt-in).
      setAudioEnabled(t.audioPolicy?.enabled === true);
      setRetentionDays(t.audioPolicy?.retentionDays ?? 30);
    }
  }, [tenantQ.data]);

  const saveM = useMutation({
    mutationFn: () =>
      tenants.update(tenantId!, {
        audioPolicy: { enabled: audioEnabled, retentionDays },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'current'] }),
  });

  if (tenantQ.isLoading) return <Spinner />;

  const features = tenantQ.data?.features;
  const audioArchiveOn = features?.audioArchive === true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Модулі"
        description="Склад модулів визначає адміністратор платформи. Налаштування запису консультацій змінює клініка."
      />

      <Card>
        <h3 className="mb-3 font-semibold">Модулі клініки</h3>
        <div className="space-y-2">
          {(Object.keys(FEATURE_LABELS) as TenantFeatureKey[]).map((key) => {
            const on = features?.[key] === true;
            return (
              <div
                key={key}
                className="flex items-center justify-between border-b border-slate-100 py-2"
              >
                <span>
                  {FEATURE_LABELS[key]}
                  {DECORATIVE.has(key) ? (
                    <span className="ml-2 text-xs text-slate-400">(поки що декоративний)</span>
                  ) : null}
                </span>
                <Badge variant={on ? 'success' : 'default'}>{on ? 'Увімкнено' : 'Вимкнено'}</Badge>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Щоб підключити або вимкнути модуль, зверніться до адміністратора платформи.
        </p>
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold">Аудіозапис консультацій</h3>
        <p className="mb-3 text-sm text-slate-500">
          Запис стартує автоматично, коли лікар і пацієнт обидва в кімнаті.
        </p>
        {!audioArchiveOn ? (
          <Alert variant="warning">
            Модуль «Аудіоархів консультацій» не підключено — запис не стартуватиме, а
            налаштування нижче не діють.
          </Alert>
        ) : null}
        <div className="mt-3 space-y-3">
          <label className="flex w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={audioEnabled}
              disabled={!audioArchiveOn}
              onChange={(e) => setAudioEnabled(e.target.checked)}
            />
            Записувати аудіо консультацій
          </label>
          <FormField label="Зберігати записи, днів" htmlFor="audio-retention">
            <Input
              id="audio-retention"
              type="number"
              min={1}
              className="max-w-[10rem]"
              disabled={!audioArchiveOn}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Math.max(1, Number(e.target.value) || 1))}
            />
          </FormField>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={() => saveM.mutate()}
            isLoading={saveM.isPending}
            disabled={!audioArchiveOn}
          >
            Зберегти
          </Button>
          {saveM.isSuccess ? <Alert variant="success">Збережено</Alert> : null}
          {saveM.isError ? <Alert variant="danger">{errorMessage(saveM.error)}</Alert> : null}
        </div>
      </Card>
    </div>
  );
};
