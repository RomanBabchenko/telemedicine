import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecordingNoticeDto } from '@telemed/shared-types';
import { Alert, Button } from '@telemed/ui';

interface Props {
  notice: RecordingNoticeDto;
  onAccept: () => void;
  onDecline: () => void;
  accepting?: boolean;
  declining?: boolean;
  error?: string | null;
}

const MicIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

// Shown to doctor and patient before they join when the clinic records the
// consultation. Not dismissible (no ESC / backdrop close) — the only ways out
// are accepting or declining, and declining cancels the appointment, so it
// goes through a second confirmation step.
export const RecordingNoticeModal = ({
  notice,
  onAccept,
  onDecline,
  accepting,
  declining,
  error,
}: Props) => {
  const [confirmDecline, setConfirmDecline] = useState(false);
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const busy = !!accepting || !!declining;

  useEffect(() => {
    primaryRef.current?.focus();
  }, [confirmDecline]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] m-0 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
      >
        {confirmDecline ? (
          <div className="space-y-5">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Відмовитися від консультації?
            </h2>
            <p className="text-slate-600">
              Без згоди на аудіозапис консультацію буде скасовано. Цю дію не можна відмінити — для
              нового запису зверніться до клініки.
            </p>
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="space-y-2">
              <Button
                ref={primaryRef}
                variant="danger"
                size="lg"
                fullWidth
                onClick={onDecline}
                isLoading={declining}
                disabled={busy}
              >
                Так, скасувати консультацію
              </Button>
              <Button
                variant="outline"
                size="lg"
                fullWidth
                onClick={() => setConfirmDecline(false)}
                disabled={busy}
              >
                Назад
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <MicIcon />
              </span>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                Запис консультації
              </h2>
            </div>
            <p className="text-slate-600">
              Ця консультація супроводжується аудіозаписом.{' '}
              <strong className="font-semibold text-slate-900">
                Відео не записується і не зберігається.
              </strong>
            </p>
            <div className="whitespace-pre-line break-words rounded-lg border border-dashed border-slate-300 px-4 py-3 text-slate-600">
              {notice.text}
            </div>
            {notice.linkUrl ? (
              <a
                href={notice.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-800 underline underline-offset-2 hover:text-blue-900"
              >
                {notice.linkLabel ?? notice.linkUrl}
                <ExternalLinkIcon />
              </a>
            ) : null}
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="space-y-2">
              <Button
                ref={primaryRef}
                variant="outline"
                size="lg"
                fullWidth
                onClick={onAccept}
                isLoading={accepting}
                disabled={busy}
              >
                Зрозуміло
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setConfirmDecline(true)}
                disabled={busy}
              >
                Відмовитися
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
