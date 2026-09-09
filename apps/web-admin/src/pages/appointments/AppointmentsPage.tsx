import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi } from '@telemed/api-client';
import {
  APPOINTMENT_SOURCE_LABELS,
  AppointmentListQuery,
  AppointmentListSort,
  AppointmentSource,
  AppointmentStatus,
  isMisScopedActor,
} from '@telemed/shared-types';
import {
  Badge,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Pagination,
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
import type { SortDirection } from '@telemed/ui';
import { DEFAULT_PAGE_SIZE, useDebouncedValue } from '@telemed/web-shared';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';

const booking = bookingApi(apiClient);

const STATUS_OPTIONS: Array<{ value: '' | AppointmentStatus; label: string }> = [
  { value: '', label: 'Усі статуси' },
  ...Object.values(AppointmentStatus).map((s) => ({ value: s, label: s })),
];

const SOURCE_OPTIONS: Array<{ value: '' | AppointmentSource; label: string }> = [
  { value: '', label: 'Усі джерела' },
  ...Object.values(AppointmentSource).map((s) => ({
    value: s,
    label: APPOINTMENT_SOURCE_LABELS[s],
  })),
];

const fullName = (first?: string, last?: string): string => {
  const value = `${first ?? ''} ${last ?? ''}`.trim();
  return value || '—';
};

// Filtering, sorting and paging all happen on the server
// (GET /appointments/admin/list) — the clinic history is unbounded, so the
// old load-everything-then-filter-in-memory approach doesn't scale.
export const AppointmentsPage = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | AppointmentStatus>('');
  const [source, setSource] = useState<'' | AppointmentSource>('');
  const [sort, setSort] = useState<AppointmentListSort>('startAt');
  const [order, setOrder] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  // INTEGRATION_ADMIN only ever receives MIS rows from the API — the source
  // filter would be a no-op, so hide it.
  const misScoped = isMisScopedActor(useAuthStore((s) => s.user?.roles));

  // Filter changes restart pagination from the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, source, sort, order]);

  const query: AppointmentListQuery = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    status: status || undefined,
    source: source || undefined,
    sort,
    order,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-appointments', query],
    queryFn: () => booking.adminList(query),
    placeholderData: (prev) => prev,
  });

  const toggleSort = (field: AppointmentListSort) => {
    if (sort === field) {
      setOrder((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('asc');
    }
  };
  const sortActive = (field: AppointmentListSort): SortDirection | null =>
    sort === field ? order : null;

  const hasFilters = !!(debouncedSearch.trim() || status || source);
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Прийоми клініки" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <FormField label="Пошук">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пацієнт, телефон або лікар"
          />
        </FormField>
        {misScoped ? null : (
          <FormField label="Джерело">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as '' | AppointmentSource)}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        )}
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
      ) : items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'Нічого не знайдено за фільтрами' : 'Поки немає прийомів'}
        />
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
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
                <SortableTH active={sortActive('source')} onSort={() => toggleSort('source')}>
                  Джерело
                </SortableTH>
                <TH>Запис</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((a) => (
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
                  <TD>
                    <Badge variant={a.source === 'MIS' ? 'warning' : 'default'}>
                      {APPOINTMENT_SOURCE_LABELS[a.source] ?? a.source}
                    </Badge>
                  </TD>
                  {/* Full player lives in the details modal; the icon means a
                   * merged recording is actually stored and downloadable. */}
                  <TD>{a.hasRecording ? '🎧' : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      )}

      {openId ? (
        <AppointmentDetailsModal appointmentId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
};
