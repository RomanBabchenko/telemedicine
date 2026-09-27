import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { feedbackApi } from '@telemed/api-client';
import {
  CLARITY_RATING_LABELS,
  CLARITY_RATING_VALUES,
  FEEDBACK_RESOLVED_LABELS,
  FEEDBACK_RESOLVED_VALUES,
} from '@telemed/shared-types';
import type { ClarityRating, FeedbackResolved } from '@telemed/shared-types';
import { Alert, Button } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const feedback = feedbackApi(apiClient);

// Per-browser "already answered" marker so a reload / re-click of the invite
// link lands on the thank-you screen instead of the form. The server's
// unique index is the real guard (a repeat POST answers 409, handled below).
const submittedKey = (appointmentId: string) => `telemed-feedback-submitted:${appointmentId}`;

export const wasFeedbackSubmitted = (appointmentId: string): boolean => {
  try {
    return localStorage.getItem(submittedKey(appointmentId)) === '1';
  } catch {
    return false;
  }
};

const markFeedbackSubmitted = (appointmentId: string): void => {
  try {
    localStorage.setItem(submittedKey(appointmentId), '1');
  } catch {
    // Private mode / blocked storage — the 409 path covers a repeat submit.
  }
};

const httpStatus = (e: unknown): number | undefined =>
  (e as { response?: { status?: number } })?.response?.status;

// 14:22 for anything under an hour, 1:04:09 above.
const formatDuration = (totalSec: number): string => {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="36"
    height="36"
    aria-hidden
    className={filled ? 'fill-amber-400 text-amber-500' : 'fill-transparent text-slate-300'}
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  >
    <path d="M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.7l6-.8z" />
  </svg>
);

// Keyboard-accessible radio group rendered as five stars. Hover previews the
// value; arrow keys move it; Space/Enter/click commit it.
const StarRating = ({
  value,
  onChange,
}: {
  value: ClarityRating | null;
  onChange: (v: ClarityRating) => void;
}) => {
  const [hover, setHover] = useState<ClarityRating | null>(null);
  const shown = hover ?? value;
  const onKeyDown = (e: React.KeyboardEvent, n: ClarityRating) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(5, n + 1) as ClarityRating);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(1, n - 1) as ClarityRating);
    }
  };
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Наскільки зрозуміло лікар пояснив?"
        className="flex items-center gap-1"
        onMouseLeave={() => setHover(null)}
      >
        {CLARITY_RATING_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} з 5 — ${CLARITY_RATING_LABELS[n]}`}
            tabIndex={value === n || (value === null && n === 1) ? 0 : -1}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(null)}
            onKeyDown={(e) => onKeyDown(e, n)}
            className="rounded-md p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <StarIcon filled={shown !== null && n <= shown} />
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-slate-500" aria-live="polite">
        {shown ? CLARITY_RATING_LABELS[shown] : 'Оберіть оцінку'}
      </p>
    </div>
  );
};

const CheckIcon = () => (
  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
    <svg
      viewBox="0 0 24 24"
      width="32"
      height="32"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-600"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  </span>
);

const ReturnToClinicLink = ({ websiteUrl }: { websiteUrl: string | null }) =>
  websiteUrl ? (
    <a
      href={websiteUrl}
      rel="noopener"
      className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
    >
      Повернутися на сайт клініки
    </a>
  ) : null;

interface Props {
  appointmentId: string;
  // Consultation length in seconds; null hides the header line.
  durationSec: number | null;
  // Clinic website (TenantDto.websiteUrl); null hides the return button.
  websiteUrl: string | null;
  // Skip straight to the thank-you screen (answered earlier in this browser).
  alreadySubmitted: boolean;
}

/**
 * Post-call screen for the patient: two-question survey → thank-you. Rendered
 * in place of the video area (dark backdrop) once the doctor has ended the
 * call. Deliberately not a Modal — the shared Modal closes on backdrop/Esc,
 * and this screen has nothing to "close" back to.
 */
export const PostCallFeedback = ({
  appointmentId,
  durationSec,
  websiteUrl,
  alreadySubmitted,
}: Props) => {
  const [stage, setStage] = useState<'form' | 'thanks'>(alreadySubmitted ? 'thanks' : 'form');
  const [resolved, setResolved] = useState<FeedbackResolved | null>(null);
  const [clarity, setClarity] = useState<ClarityRating | null>(null);
  // Non-blocking failure note — the patient still gets the return link.
  const [softError, setSoftError] = useState<string | null>(null);

  const submitM = useMutation({
    mutationFn: () =>
      feedback.submit(appointmentId, { resolved: resolved!, clarityRating: clarity! }),
    onSuccess: () => {
      markFeedbackSubmitted(appointmentId);
      setStage('thanks');
    },
    onError: (e: unknown) => {
      const status = httpStatus(e);
      if (status === 409) {
        // Already answered (other tab/device) — nothing more to collect.
        markFeedbackSubmitted(appointmentId);
        setStage('thanks');
        return;
      }
      // 401 — invite JWT expired (call ran far past the slot); 403 — module
      // switched off mid-call / not the patient; 404 — API not yet deployed;
      // anything else — network. None of these are the patient's fault.
      setSoftError('Не вдалося надіслати відповідь. Дякуємо, що спробували.');
      setStage('thanks');
    },
  });

  const canSubmit = resolved !== null && clarity !== null && !submitM.isPending;

  return (
    <div
      className="flex flex-col rounded-lg bg-slate-950 p-4 text-white sm:p-6"
      style={{ minHeight: 'calc(100dvh - 320px)' }}
    >
      {durationSec !== null ? (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          <span>
            Консультація тривала{' '}
            <strong className="text-white">{formatDuration(durationSec)}</strong>
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center py-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
          {stage === 'form' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Консультацію завершено</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Два коротких питання — це займе <strong>10</strong> секунд
                </p>
              </div>

              <fieldset>
                <legend className="mb-2 text-base font-medium">Чи вирішено ваше питання?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {FEEDBACK_RESOLVED_VALUES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={resolved === v}
                      onClick={() => setResolved(v)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                        resolved === v
                          ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {FEEDBACK_RESOLVED_LABELS[v]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <p className="mb-2 text-base font-medium">Наскільки зрозуміло лікар пояснив?</p>
                <StarRating value={clarity} onChange={setClarity} />
              </div>

              <Button
                fullWidth
                size="lg"
                variant="outline"
                disabled={!canSubmit}
                isLoading={submitM.isPending}
                onClick={() => submitM.mutate()}
              >
                Надіслати відповідь
              </Button>

              <p className="text-center text-xs text-slate-400">
                Відповідь бачить лише медичний директор.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4 text-center">
              <CheckIcon />
              <h2 className="text-xl font-semibold">Дякуємо за відповідь</h2>
              <p className="text-sm text-slate-500">
                Ваша оцінка допомагає нам робити консультації кращими. Бажаємо вам міцного
                здоров&apos;я.
              </p>
              {softError ? (
                <div className="w-full text-left">
                  <Alert variant="warning">{softError}</Alert>
                </div>
              ) : null}
              <ReturnToClinicLink websiteUrl={websiteUrl} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
