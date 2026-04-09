import { useState } from 'react';
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
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@telemed/ui';
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

  const { data, isLoading } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => patients.myDocuments(),
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
        <Table>
          <THead>
            <TR>
              <TH>Дата</TH>
              <TH>Тип</TH>
              <TH>Лікар</TH>
              <TH>Спеціалізація</TH>
              <TH>Статус</TH>
              <TH>Дії</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((d) => {
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
    </div>
  );
};
