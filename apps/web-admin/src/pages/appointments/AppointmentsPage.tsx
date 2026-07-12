import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import { AppointmentStatus } from '@telemed/shared-types';
import {
  Badge,
  EmptyState,
  FormField,
  Input,
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
import { AppointmentDetailsModal } from './AppointmentDetailsModal';

const booking = bookingApi(apiClient);

const STATUS_OPTIONS: Array<{ value: '' | AppointmentStatus; label: string }> = [
  { value: '', label: 'Усі статуси' },
  ...Object.values(AppointmentStatus).map((s) => ({ value: s, label: s })),
];

const fullName = (first?: string, last?: string): string => {
  const value = `${first ?? ''} ${last ?? ''}`.trim();
  return value || '—';
};

export const AppointmentsPage = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-appointments'],
    queryFn: () => booking.list(),
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | AppointmentStatus>('');

  const needle = search.trim().toLowerCase();
  const { rows, toggleSort, sortActive } = useTableControls(data, {
    sortValues: {
      startAt: (a) => a.startAt,
      patient: (a) => fullName(a.patient?.firstName, a.patient?.lastName),
      doctor: (a) => fullName(a.doctor?.firstName, a.doctor?.lastName),
      status: (a) => a.status,
    },
    filter: (a) => {
      if (status && a.status !== status) return false;
      if (!needle) return true;
      const haystack = `${fullName(a.patient?.firstName, a.patient?.lastName)} ${fullName(
        a.doctor?.firstName,
        a.doctor?.lastName,
      )}`.toLowerCase();
      return haystack.includes(needle);
    },
    initialSort: { field: 'startAt', dir: 'desc' },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Прийоми клініки" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Пошук">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пацієнт або лікар"
          />
        </FormField>
        <FormField label="Статус">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | AppointmentStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Поки немає прийомів" />
      ) : rows.length === 0 ? (
        <EmptyState title="Нічого не знайдено за фільтрами" />
      ) : (
        <Table>
          <THead>
            <TR>
              <SortableTH active={sortActive('startAt')} onSort={() => toggleSort('startAt')}>
                Дата
              </SortableTH>
              <SortableTH active={sortActive('patient')} onSort={() => toggleSort('patient')}>
                Пацієнт
              </SortableTH>
              <TH>Телефон</TH>
              <SortableTH active={sortActive('doctor')} onSort={() => toggleSort('doctor')}>
                Лікар
              </SortableTH>
              <TH>Спеціальність</TH>
              <SortableTH active={sortActive('status')} onSort={() => toggleSort('status')}>
                Статус
              </SortableTH>
              <TH>Запис</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((a) => (
              <TR
                key={a.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setOpenId(a.id)}
              >
                <TD>{dayjs(a.startAt).format('DD.MM.YYYY HH:mm')}</TD>
                <TD>{fullName(a.patient?.firstName, a.patient?.lastName)}</TD>
                <TD>{a.patient?.phone ?? '—'}</TD>
                <TD>{fullName(a.doctor?.firstName, a.doctor?.lastName)}</TD>
                <TD>{a.doctor?.specializations?.join(', ') || '—'}</TD>
                <TD>
                  <Badge>{a.status}</Badge>
                </TD>
                {/* Full player lives in the details modal; the icon means a
                 * merged recording is actually stored and downloadable. */}
                <TD>{a.hasRecording ? '🎧' : '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {openId ? (
        <AppointmentDetailsModal appointmentId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
};
