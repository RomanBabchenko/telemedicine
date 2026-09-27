import {
  DEFAULT_RECORDING_NOTICE_TEXT,
  RECORDING_NOTICE_MAX_LENGTH,
  type TenantConsultationPolicyDto,
} from '@telemed/shared-types';
import { FormField, Input, Textarea } from '@telemed/ui';

// Form state: plain strings for the inputs, '' = not set.
export interface ConsultationPolicyForm {
  recordingNoticeEnabled: boolean;
  recordingNoticeText: string;
  offerUrl: string;
}

export const toConsultationPolicyForm = (
  p: TenantConsultationPolicyDto | undefined,
): ConsultationPolicyForm => ({
  // Missing = ON, same default as the API mapper.
  recordingNoticeEnabled: p?.recordingNoticeEnabled !== false,
  recordingNoticeText: p?.recordingNoticeText ?? '',
  offerUrl: p?.offerUrl ?? '',
});

export const fromConsultationPolicyForm = (
  f: ConsultationPolicyForm,
): TenantConsultationPolicyDto => ({
  recordingNoticeEnabled: f.recordingNoticeEnabled,
  recordingNoticeText: f.recordingNoticeText.trim() || null,
  offerUrl: f.offerUrl.trim() || null,
});

export const offerUrlError = (f: ConsultationPolicyForm): string | undefined => {
  const url = f.offerUrl.trim();
  return url && !/^https?:\/\/\S+$/i.test(url)
    ? 'Посилання має починатися з http:// або https://'
    : undefined;
};

interface Props {
  value: ConsultationPolicyForm;
  onChange: (next: ConsultationPolicyForm) => void;
  // audioArchive module + audioPolicy.enabled — the notice only shows then.
  recordingActive: boolean;
  websiteUrl: string | null;
}

// Settings of the video-consultation module: the recording notice doctor and
// patient see (and must accept) before joining. Shared by the clinic's
// «Модулі» page and the platform tenant editor.
export const ConsultationPolicyFields = ({
  value,
  onChange,
  recordingActive,
  websiteUrl,
}: Props) => {
  const set = (patch: Partial<ConsultationPolicyForm>) => onChange({ ...value, ...patch });
  const disabled = !value.recordingNoticeEnabled;
  return (
    <div className="space-y-3">
      <label className="flex w-fit items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.recordingNoticeEnabled}
          onChange={(e) => set({ recordingNoticeEnabled: e.target.checked })}
        />
        <span>
          Показувати попередження про запис перед консультацією
          <span className="block text-xs text-slate-500">
            Лікар і пацієнт мають натиснути «Зрозуміло», щоб підключитися. Відмова скасовує
            консультацію.
          </span>
          {!recordingActive ? (
            <span className="block text-xs text-amber-700">
              Аудіозапис зараз вимкнено — попередження не показується, доки запис не увімкнено.
            </span>
          ) : null}
        </span>
      </label>
      <FormField
        label="Текст попередження"
        htmlFor="recording-notice-text"
        hint={`${value.recordingNoticeText.length}/${RECORDING_NOTICE_MAX_LENGTH}. Порожнє поле — текст за замовчуванням.`}
      >
        <Textarea
          id="recording-notice-text"
          rows={3}
          maxLength={RECORDING_NOTICE_MAX_LENGTH}
          placeholder={DEFAULT_RECORDING_NOTICE_TEXT}
          disabled={disabled}
          value={value.recordingNoticeText}
          onChange={(e) => set({ recordingNoticeText: e.target.value })}
        />
      </FormField>
      <FormField
        label="Посилання на договір публічної оферти"
        htmlFor="recording-notice-offer"
        error={offerUrlError(value)}
        hint={
          websiteUrl
            ? `Якщо не задано — показуємо посилання на сайт клініки (${websiteUrl}).`
            : 'Якщо не задано і сайт клініки не вказано у «Брендингу» — посилання не показується.'
        }
      >
        <Input
          id="recording-notice-offer"
          type="url"
          placeholder="https://clinic.example/oferta"
          disabled={disabled}
          value={value.offerUrl}
          onChange={(e) => set({ offerUrl: e.target.value })}
        />
      </FormField>
    </div>
  );
};
