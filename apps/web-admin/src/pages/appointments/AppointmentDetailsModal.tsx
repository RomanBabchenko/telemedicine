import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi, consultationApi } from '@telemed/api-client';
import {
  APPOINTMENT_SOURCE_LABELS,
  AppointmentStatus,
  hasAnyRole,
  type ReissueInvitesDto,
  type Role,
} from '@telemed/shared-types';
import { Alert, Badge, Button, Modal, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { useTenant } from '../../hooks/useTenant';

// Roles allowed on POST /appointments/:id/invites (admin-invite.controller).
const INVITE_ROLES: readonly Role[] = ['CLINIC_ADMIN', 'PLATFORM_SUPER_ADMIN', 'INTEGRATION_ADMIN'];

const booking = bookingApi(apiClient);
const consultation = consultationApi(apiClient);

// Mirrors the server's TERMINAL_APPOINTMENT_STATUSES — the reissue endpoint
// answers 409 for these; disable the button up front for clearer UX.
const TERMINAL_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DOCUMENTATION_COMPLETED,
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.CANCELLED_BY_PROVIDER,
  AppointmentStatus.NO_SHOW_PATIENT,
  AppointmentStatus.NO_SHOW_PROVIDER,
  AppointmentStatus.REFUNDED,
]);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-1.5 text-sm">
    <span className="shrink-0 text-slate-500">{label}</span>
    <span className="text-right text-slate-800">{value ?? '—'}</span>
  </div>
);

const CopyableUrl = ({ label, url }: { label: string; url: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">{url}</code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? '✓' : 'Копіювати'}
      </Button>
    </div>
  );
};

interface Props {
  appointmentId: string;
  onClose: () => void;
}

export const AppointmentDetailsModal = ({ appointmentId, onClose }: Props) => {
  const detailsQ = useQuery({
    queryKey: ['admin-appointment', appointmentId],
    queryFn: () => booking.getById(appointmentId),
  });
  const a = detailsQ.data;
  const roles = useAuthStore((s) => s.user?.roles);
  const tenant = useTenant();
  // GET /sessions/:id/recording is gated by the audioArchive module — don't
  // fire a request that will 403; show a clear "module off" note instead.
  const audioArchiveOn = tenant?.features?.audioArchive !== false;
  // Invite reissue is MIS-only in practice (the endpoint requires misSync)
  // and CHIEF_MEDICAL_OFFICER is read-only — hide the control for them.
  const canReissue = hasAnyRole(roles, INVITE_ROLES) && a?.source === 'MIS';

  const recordingQ = useQuery({
    queryKey: ['admin-appointment-recording', a?.consultationSessionId],
    queryFn: () => consultation.getRecording(a!.consultationSessionId!),
    enabled: !!a?.consultationSessionId && audioArchiveOn,
    retry: false,
  });

  const [invites, setInvites] = useState<ReissueInvitesDto | null>(null);
  const reissueM = useMutation({
    mutationFn: () => booking.reissueInvites(appointmentId),
    onSuccess: setInvites,
  });

  const fullName = (p?: { firstName?: string; lastName?: string } | null) =>
    p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—' : '—';

  const terminal = a ? TERMINAL_STATUSES.has(a.status) : false;

  return (
    <Modal open onClose={onClose} title="Деталі прийому" size="xl">
      {detailsQ.isLoading || !a ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <section>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Пацієнт</h4>
                <Row label="ПІБ" value={a.isAnonymousPatient ? 'Анонімний пацієнт' : fullName(a.patient)} />
                <Row label="Телефон" value={a.patient?.phone} />
                <Row label="Email" value={a.patient?.email} />
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Лікар</h4>
                <Row label="ПІБ" value={fullName(a.doctor)} />
                <Row label="Спеціалізації" value={a.doctor?.specializations?.join(', ')} />
              </div>
            </div>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Прийом</h4>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div>
                <Row label="Початок" value={dayjs(a.startAt).format('DD.MM.YYYY HH:mm')} />
                <Row label="Кінець" value={dayjs(a.endAt).format('DD.MM.YYYY HH:mm')} />
                <Row label="Створено" value={dayjs(a.createdAt).format('DD.MM.YYYY HH:mm')} />
                <Row label="Статус" value={<Badge>{a.status}</Badge>} />
                <Row
                  label="Джерело"
                  value={
                    <Badge variant={a.source === 'MIS' ? 'warning' : 'default'}>
                      {APPOINTMENT_SOURCE_LABELS[a.source] ?? a.source}
                    </Badge>
                  }
                />
              </div>
              <div>
                <Row
                  label="Оплата (МІС)"
                  value={
                    a.misPaymentType
                      ? `${a.misPaymentType} · ${a.misPaymentStatus ?? 'unpaid'}`
                      : null
                  }
                />
                <Row label="Payment ID" value={a.paymentId} />
                <Row label="Причина звернення" value={a.reasonText} />
              </div>
            </div>
          </section>

          {canReissue ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase text-slate-400">Інвайт-посилання</h4>
              <Button
                size="sm"
                onClick={() => reissueM.mutate()}
                isLoading={reissueM.isPending}
                disabled={terminal}
                title={terminal ? 'Прийом у термінальному статусі' : undefined}
              >
                Виписати нові посилання
              </Button>
            </div>
            {terminal ? (
              <p className="text-xs text-slate-400">
                Для завершеного/скасованого прийому нові посилання не виписуються.
              </p>
            ) : null}
            {reissueM.isError ? (
              <Alert variant="danger">Не вдалося виписати посилання. Спробуйте ще раз.</Alert>
            ) : null}
            {invites ? (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-amber-600">
                  Попередні посилання відкликано. Нові діють до кінця прийому (+30 хв).
                </p>
                <CopyableUrl label="Пацієнт" url={invites.patientInviteUrl} />
                <CopyableUrl label="Лікар" url={invites.doctorInviteUrl} />
              </div>
            ) : null}
          </section>
          ) : null}

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-slate-400">Запис консультації</h4>
            {!audioArchiveOn ? (
              <p className="text-sm text-slate-400">
                Аудіоархів вимкнено в модулях клініки — записи недоступні.
              </p>
            ) : !a.consultationSessionId ? (
              <p className="text-sm text-slate-400">Консультація ще не створена — запису немає.</p>
            ) : recordingQ.isLoading ? (
              <Spinner />
            ) : recordingQ.data?.status === 'STORED' && recordingQ.data.downloadUrl ? (
              /* Full-width player — the whole point of the xl modal. */
              <audio controls preload="none" className="w-full">
                <source src={recordingQ.data.downloadUrl} type="audio/mpeg" />
              </audio>
            ) : recordingQ.data?.status === 'RECORDING' ? (
              <Badge>Йде запис…</Badge>
            ) : (
              <p className="text-sm text-slate-400">Запис недоступний.</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};
