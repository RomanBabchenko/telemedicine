import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doctorsApi } from '@telemed/api-client';
import type {
  CreateDoctorDto,
  DoctorDto,
  UpdateDoctorDto,
} from '@telemed/shared-types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
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
import { DoctorFormModal } from './DoctorFormModal';

const doctors = doctorsApi(apiClient);

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; doctor: DoctorDto }
  | { kind: 'deactivate'; doctor: DoctorDto }
  | { kind: 'verify'; doctor: DoctorDto };

const errorMessage = (error: unknown): string => {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

export const DoctorsPage = () => {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  const listQ = useQuery({
    queryKey: ['admin-doctors'],
    queryFn: () => doctors.searchAdmin({ pageSize: 100 }),
  });

  const close = () => setModal({ kind: 'closed' });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-doctors'] });

  const createM = useMutation({
    mutationFn: (dto: CreateDoctorDto) => doctors.create(dto),
    onSuccess: () => {
      invalidate();
      close();
    },
  });

  const updateM = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateDoctorDto }) =>
      doctors.update(id, dto),
    onSuccess: () => {
      invalidate();
      close();
    },
  });

  const deactivateM = useMutation({
    mutationFn: (id: string) => doctors.delete(id),
    onSuccess: () => {
      invalidate();
      close();
    },
  });

  // Direct activate, no confirmation modal — re-publishing is harmless.
  const activateM = useMutation({
    mutationFn: (id: string) => doctors.activate(id),
    onSuccess: () => invalidate(),
  });

  const verifyM = useMutation({
    mutationFn: (id: string) => doctors.verify(id),
    onSuccess: () => {
      invalidate();
      close();
    },
  });

  const regenSlotsM = useMutation({
    mutationFn: (id: string) => doctors.regenerateSlots(id),
  });

  const isFormOpen = modal.kind === 'create' || modal.kind === 'edit';
  const editingDoctor = modal.kind === 'edit' ? modal.doctor : null;
  const deactivatingDoctor = modal.kind === 'deactivate' ? modal.doctor : null;
  const verifyingDoctor = modal.kind === 'verify' ? modal.doctor : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Лікарі клініки"
        actions={
          <Button onClick={() => setModal({ kind: 'create' })}>Додати лікаря</Button>
        }
      />

      {listQ.isLoading ? (
        <Spinner />
      ) : listQ.isError ? (
        <Alert variant="danger">{errorMessage(listQ.error)}</Alert>
      ) : (listQ.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="У клініці поки немає лікарів" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Лікар</TH>
              <TH>Спеціальність</TH>
              <TH>Стаж</TH>
              <TH>Ціна</TH>
              <TH>Верифікація</TH>
              <TH>Активність</TH>
              <TH>Дії</TH>
            </TR>
          </THead>
          <TBody>
            {listQ.data?.items.map((d) => (
              <TR key={d.id}>
                <TD>
                  {d.firstName} {d.lastName}
                </TD>
                <TD>{d.specializations.join(', ')}</TD>
                <TD>{d.yearsOfExperience} років</TD>
                <TD>{d.basePrice} ₴</TD>
                <TD>
                  <Badge
                    variant={d.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}
                  >
                    {d.verificationStatus}
                  </Badge>
                </TD>
                <TD>
                  <Badge variant={d.isPublished ? 'success' : 'default'}>
                    {d.isPublished ? 'АКТИВНИЙ' : 'НЕАКТИВНИЙ'}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex gap-2">
                    {d.verificationStatus !== 'VERIFIED' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setModal({ kind: 'verify', doctor: d })}
                      >
                        Підтвердити
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setModal({ kind: 'edit', doctor: d })}
                    >
                      Редагувати
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={regenSlotsM.isPending && regenSlotsM.variables === d.id}
                      onClick={() => regenSlotsM.mutate(d.id)}
                    >
                      Слоти
                    </Button>
                    {d.isPublished ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setModal({ kind: 'deactivate', doctor: d })}
                      >
                        Деактивувати
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        isLoading={activateM.isPending && activateM.variables === d.id}
                        onClick={() => activateM.mutate(d.id)}
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

      <DoctorFormModal
        open={isFormOpen}
        mode={modal.kind === 'edit' ? 'edit' : 'create'}
        initial={editingDoctor}
        isPending={modal.kind === 'edit' ? updateM.isPending : createM.isPending}
        error={modal.kind === 'edit' ? updateM.error : createM.error}
        onClose={close}
        onSubmitCreate={(dto) => createM.mutate(dto)}
        onSubmitUpdate={(dto) => {
          if (editingDoctor) updateM.mutate({ id: editingDoctor.id, dto });
        }}
      />

      <Modal
        open={modal.kind === 'verify'}
        onClose={close}
        title="Підтвердити лікаря?"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={verifyM.isPending}>
              Скасувати
            </Button>
            <Button
              variant="primary"
              isLoading={verifyM.isPending}
              onClick={() => {
                if (verifyingDoctor) verifyM.mutate(verifyingDoctor.id);
              }}
            >
              Підтвердити
            </Button>
          </>
        }
      >
        {verifyingDoctor ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Документи лікаря{' '}
              <strong>
                {verifyingDoctor.firstName} {verifyingDoctor.lastName}
              </strong>{' '}
              перевірені, кваліфікація підтверджена. Статус буде змінено на VERIFIED.
            </p>
            {verifyM.isError ? (
              <Alert variant="danger">{errorMessage(verifyM.error)}</Alert>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modal.kind === 'deactivate'}
        onClose={close}
        title="Деактивувати лікаря?"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={deactivateM.isPending}>
              Скасувати
            </Button>
            <Button
              variant="danger"
              isLoading={deactivateM.isPending}
              onClick={() => {
                if (deactivatingDoctor) deactivateM.mutate(deactivatingDoctor.id);
              }}
            >
              Деактивувати
            </Button>
          </>
        }
      >
        {deactivatingDoctor ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Лікар{' '}
              <strong>
                {deactivatingDoctor.firstName} {deactivatingDoctor.lastName}
              </strong>{' '}
              буде прихований у публічному каталозі клініки. Обліковий запис, історія
              прийомів і email залишаються — у будь-який момент можна повернути врача
              кнопкою «Активувати».
            </p>
            {deactivateM.isError ? (
              <Alert variant="danger">{errorMessage(deactivateM.error)}</Alert>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
