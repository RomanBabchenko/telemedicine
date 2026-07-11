import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { patientsApi } from '@telemed/api-client';
import type { MedicalDocumentDto } from '@telemed/shared-types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Select,
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

const patients = patientsApi(apiClient);

const doctorName = (d: MedicalDocumentDto): string => {
  const first = d.doctor?.firstName ?? '';
  const last = d.doctor?.lastName ?? '';
  const full = `${first} ${last}`.trim();
  return full || '—';
};

const doctorSpecs = (d: MedicalDocumentDto): string =>
  d.doctor?.specializations?.join(', ') || '—';

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Не вдалося завантажити PDF';
};

export const DocumentsPage = () => {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => patients.myDocuments(),
  });

  const types = useMemo(
    () => Array.from(new Set((data ?? []).map((d) => d.type))).sort(),
    [data],
  );
  const statuses = useMemo(
    () => Array.from(new Set((data ?? []).map((d) => d.status))).sort(),
    [data],
  );

  const { rows, toggleSort, sortActive } = useTableControls(data, {
    sortValues: { createdAt: (d) => d.createdAt },
    filter: (d) =>
      (!typeFilter || d.type === typeFilter) && (!statusFilter || d.status === statusFilter),
    initialSort: { field: 'createdAt', dir: 'desc' },
  });

  const downloadM = useMutation({
    mutationFn: (id: string) => patients.myDocumentPdf(id),
    onSuccess: ({ url }) => {
      setDownloadError(null);
      // Open the signed URL in a new tab — the browser will follow it
      // straight to MinIO and either render the PDF or save it.
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    onError: (e) => setDownloadError(errorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Мої медичні документи" />
      {downloadError ? <Alert variant="danger">{downloadError}</Alert> : null}
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Документів поки немає" />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Select
                aria-label="Фільтр за типом"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">Усі типи</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-56">
              <Select
                aria-label="Фільтр за статусом"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Усі статуси</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Нічого не знайдено" description="Спробуйте інший фільтр." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <SortableTH
                    active={sortActive('createdAt')}
                    onSort={() => toggleSort('createdAt')}
                  >
                    Дата
                  </SortableTH>
                  <TH>Тип</TH>
                  <TH>Лікар</TH>
                  <TH>Спеціалізація</TH>
                  <TH>Статус</TH>
                  <TH>Дії</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((d) => {
                  const isPending =
                    downloadM.isPending && downloadM.variables === d.id;
                  const canDownload = d.status === 'SIGNED';
                  return (
                    <TR key={d.id}>
                      <TD>{dayjs(d.createdAt).format('DD.MM.YYYY')}</TD>
                      <TD>{d.type}</TD>
                      <TD>{doctorName(d)}</TD>
                      <TD>{doctorSpecs(d)}</TD>
                      <TD>
                        <Badge variant={d.status === 'SIGNED' ? 'success' : 'default'}>
                          {d.status}
                        </Badge>
                      </TD>
                      <TD>
                        <Button
                          size="sm"
                          variant="outline"
                          isLoading={isPending}
                          disabled={!canDownload}
                          onClick={() => downloadM.mutate(d.id)}
                        >
                          Завантажити
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
};
