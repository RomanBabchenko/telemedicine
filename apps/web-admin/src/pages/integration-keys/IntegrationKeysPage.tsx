import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationKeysApi } from '@telemed/api-client';
import type {
  CreateIntegrationApiKeyResponseDto,
  IntegrationApiKeyDto,
} from '@telemed/shared-types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const keysApi = integrationKeysApi(apiClient);

const CONNECTORS = [{ value: 'docdream', label: 'DocDream' }];

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : '—';

const statusBadge = (k: IntegrationApiKeyDto) =>
  k.revokedAt ? (
    <Badge variant="danger">Відкликано</Badge>
  ) : (
    <Badge variant="success">Активний</Badge>
  );

export const IntegrationKeysPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const qc = useQueryClient();

  const keysQ = useQuery({
    queryKey: ['integration-keys', tenantId],
    queryFn: () => keysApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [connectorId, setConnectorId] = useState('docdream');
  const [name, setName] = useState('');
  const [ipAllowlistText, setIpAllowlistText] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CreateIntegrationApiKeyResponseDto | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const resetCreateForm = () => {
    setConnectorId('docdream');
    setName('');
    setIpAllowlistText('');
    setCreateError(null);
  };

  const createM = useMutation({
    mutationFn: () => {
      const allowlist = ipAllowlistText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      return keysApi.create(tenantId!, {
        connectorId,
        name: name.trim() || undefined,
        ipAllowlist: allowlist.length > 0 ? allowlist : undefined,
      });
    },
    onSuccess: (res) => {
      setReveal(res);
      setCreateOpen(false);
      resetCreateForm();
      qc.invalidateQueries({ queryKey: ['integration-keys', tenantId] });
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const revokeM = useMutation({
    mutationFn: (keyId: string) => keysApi.revoke(tenantId!, keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration-keys', tenantId] }),
  });

  const copyRawKey = async () => {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may fail on insecure origins — user can select text manually
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Інтеграційні ключі"
        description="API-ключі для M2M інтеграції з зовнішніми МІС (наприклад DocDream). Ключ передаєтсья у заголовку Authorization: ApiKey ..."
        actions={
          <Button onClick={() => setCreateOpen(true)}>Створити ключ</Button>
        }
      />

      <Card>
        {keysQ.isLoading ? (
          <Spinner />
        ) : keysQ.data && keysQ.data.length > 0 ? (
          <Table>
            <THead>
              <TR>
                <TH>Конектор</TH>
                <TH>Назва</TH>
                <TH>Ключ</TH>
                <TH>IP allowlist</TH>
                <TH>Останнє використання</TH>
                <TH>Створено</TH>
                <TH>Статус</TH>
                <TH>{' '}</TH>
              </TR>
            </THead>
            <TBody>
              {keysQ.data.map((k) => (
                <TR key={k.id}>
                  <TD>{k.connectorId}</TD>
                  <TD>{k.name ?? <span className="text-slate-400">—</span>}</TD>
                  <TD>
                    <span className="font-mono text-xs">{k.keyMasked}</span>
                  </TD>
                  <TD>
                    {k.ipAllowlist && k.ipAllowlist.length > 0 ? (
                      <span className="text-xs">{k.ipAllowlist.join(', ')}</span>
                    ) : (
                      <span className="text-xs text-slate-400">будь-який IP</span>
                    )}
                  </TD>
                  <TD>
                    <span className="text-xs">{formatDate(k.lastUsedAt)}</span>
                  </TD>
                  <TD>
                    <span className="text-xs">{formatDate(k.createdAt)}</span>
                  </TD>
                  <TD>{statusBadge(k)}</TD>
                  <TD>
                    {!k.revokedAt ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={
                          revokeM.isPending && revokeM.variables === k.id
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              `Відкликати ключ ${k.keyMasked}?`,
                            )
                          ) {
                            revokeM.mutate(k.id);
                          }
                        }}
                      >
                        Відкликати
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            title="Немає жодного ключа"
            description='Створіть перший ключ кнопкою "Створити ключ" вгорі.'
          />
        )}
      </Card>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title="Новий інтеграційний ключ"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Скасувати
            </Button>
            <Button onClick={() => createM.mutate()} isLoading={createM.isPending}>
              Створити
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Конектор">
            <Select value={connectorId} onChange={(e) => setConnectorId(e.target.value)}>
              {CONNECTORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Назва (опційно)" hint="Наприклад: prod docdream, dev env">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prod docdream"
            />
          </FormField>
          <FormField
            label="IP allowlist (опційно)"
            hint="По одному запису на строку. Формати: 10.0.0.5 або 10.0.0.0/24. Порожньо = будь-який IP."
          >
            <Textarea
              value={ipAllowlistText}
              onChange={(e) => setIpAllowlistText(e.target.value)}
              rows={4}
              placeholder={'10.0.0.5\n203.0.113.0/24'}
            />
          </FormField>
          {createError ? <Alert variant="danger">{createError}</Alert> : null}
        </div>
      </Modal>

      {/* Reveal modal — raw key shown once */}
      <Modal
        open={!!reveal}
        onClose={() => {
          setReveal(null);
          setCopied(false);
        }}
        title="Ключ створено"
        footer={
          <Button
            onClick={() => {
              setReveal(null);
              setCopied(false);
            }}
          >
            Готово
          </Button>
        }
      >
        {reveal ? (
          <div className="space-y-3">
            <Alert variant="warning" title="Збережіть ключ зараз">
              Ми показуємо сирий ключ тільки один раз. Якщо закриєте це вікно
              без копіювання — доведеться створити новий.
            </Alert>
            <div className="break-all rounded border border-slate-200 bg-slate-50 p-3 font-mono text-sm">
              {reveal.rawKey}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyRawKey}>
                {copied ? 'Скопійовано ✓' : 'Скопіювати'}
              </Button>
              <span className="text-xs text-slate-500">
                Маска: <span className="font-mono">{reveal.keyMasked}</span>
              </span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
