import { useRef, useState, type DragEvent } from 'react';
import {
  MIS_DOCUMENT_MAX_BYTES,
  type MisDocumentContentType,
  type MisDocumentUploadDto,
  type MisDocumentUploadResultDto,
} from '@telemed/shared-types';
import { Button, Modal } from '@telemed/ui';
import { fileToBase64, resolveContentType, sanitiseFileName } from './file-to-base64';

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error';

interface Item {
  id: string;
  file: File;
  contentType: MisDocumentContentType | null;
  status: ItemStatus;
  error?: string;
}

export interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  // One call per file; the modal never sees the MIS URL — the API relays.
  upload: (dto: MisDocumentUploadDto) => Promise<MisDocumentUploadResultDto>;
  // Portal target — the fullscreen call container when opened mid-call.
  container?: HTMLElement | null;
}

const MAX_MB = Math.round(MIS_DOCUMENT_MAX_BYTES / (1024 * 1024));
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*';

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Очікує',
  uploading: 'Надсилається…',
  done: 'Надіслано',
  error: 'Помилка',
};

const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

// NestJS error envelope: { statusCode, message, code } in axios's
// error.response.data. The relay endpoint's 502/504 messages are already
// Ukrainian; map the generic transport codes here.
const describeError = (e: unknown): string => {
  const data = (e as { response?: { data?: { message?: unknown; code?: unknown } } })?.response
    ?.data;
  if (data?.code === 'payload.too_large') return `Файл завеликий для надсилання (до ${MAX_MB} МБ)`;
  if (data?.code === 'mis_upload.not_configured')
    return 'Клініка не налаштувала приймання документів';
  if (typeof data?.message === 'string' && data.message.length > 0) return data.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Не вдалося надіслати файл';
};

let seq = 0;
const nextId = () => `f${Date.now().toString(36)}-${(seq += 1)}`;

export const DocumentUploadModal = ({
  open,
  onClose,
  upload,
  container,
}: DocumentUploadModalProps) => {
  const [items, setItems] = useState<Item[]>([]);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, changes: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const added: Item[] = Array.from(list).map((file) => {
      const base = { id: nextId(), file, contentType: resolveContentType(file) };
      if (file.size === 0) return { ...base, status: 'error' as const, error: 'Порожній файл' };
      if (file.size > MIS_DOCUMENT_MAX_BYTES) {
        return { ...base, status: 'error' as const, error: `Файл більший за ${MAX_MB} МБ` };
      }
      if (!base.contentType) {
        return {
          ...base,
          status: 'error' as const,
          error: 'Непідтримуваний формат (PDF, JPG, PNG, WEBP, HEIC)',
        };
      }
      return { ...base, status: 'pending' as const };
    });
    setItems((prev) => [...prev, ...added]);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (sending) return;
    addFiles(e.dataTransfer?.files ?? null);
  };

  const openPicker = () => {
    if (!sending) inputRef.current?.click();
  };

  const send = async () => {
    if (sendingRef.current) return;
    const queue = items.filter((it) => it.status === 'pending');
    if (queue.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    try {
      // Sequential on purpose: one ~13 MB body in flight at a time keeps
      // memory bounded on phones and gives per-file status to the user.
      for (const it of queue) {
        patch(it.id, { status: 'uploading', error: undefined });
        try {
          // base64 is computed here and dropped after the call — it is never
          // held in React state.
          const contentBase64 = await fileToBase64(it.file);
          await upload({
            fileName: sanitiseFileName(it.file.name),
            contentType: it.contentType as MisDocumentContentType,
            sizeBytes: it.file.size,
            contentBase64,
          });
          patch(it.id, { status: 'done' });
        } catch (e) {
          patch(it.id, { status: 'error', error: describeError(e) });
        }
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const close = () => {
    if (sending) return;
    setItems([]);
    onClose();
  };

  const pendingCount = items.filter((it) => it.status === 'pending').length;
  const doneCount = items.filter((it) => it.status === 'done').length;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Надіслати документи"
      container={container}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={sending}>
            Закрити
          </Button>
          <Button onClick={() => void send()} isLoading={sending} disabled={pendingCount === 0}>
            Відправити{pendingCount > 1 ? ` (${pendingCount})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Файли передаються безпосередньо до медичної системи вашої клініки й не зберігаються на
          цьому сайті. PDF або фото до {MAX_MB} МБ кожен.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="Обрати файли для надсилання"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!sending) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={[
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-slate-300 bg-slate-50 hover:bg-slate-100',
            sending ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
        >
          <UploadIcon />
          <div className="text-sm font-medium text-slate-800">
            Перетягніть файли сюди або натисніть, щоб обрати
          </div>
          <div className="text-xs text-slate-500">
            На телефоні — зробіть фото або оберіть із галереї
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              // Reset so picking the same file again re-fires onChange.
              e.target.value = '';
            }}
          />
        </div>

        {items.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {items.map((it) => (
              <li key={it.id} className="flex items-start gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800" title={it.file.name}>
                    {it.file.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatSize(it.file.size)}
                    <span className="mx-1 text-slate-300">·</span>
                    <span
                      className={
                        it.status === 'done'
                          ? 'text-emerald-600'
                          : it.status === 'error'
                            ? 'text-red-600'
                            : it.status === 'uploading'
                              ? 'text-primary'
                              : 'text-slate-500'
                      }
                    >
                      {STATUS_LABEL[it.status]}
                    </span>
                    {it.error ? <span className="text-red-600"> — {it.error}</span> : null}
                  </div>
                </div>
                {it.status === 'pending' || it.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                    disabled={sending}
                    className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    aria-label={`Прибрати ${it.file.name}`}
                  >
                    Прибрати
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {doneCount > 0 && pendingCount === 0 && !sending ? (
          <p className="text-sm text-emerald-700">
            Надіслано файлів: {doneCount}. Можете додати ще або закрити вікно.
          </p>
        ) : null}
      </div>
    </Modal>
  );
};

const UploadIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-slate-400"
    aria-hidden
  >
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);
