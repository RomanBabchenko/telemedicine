import { useState } from 'react';
import type { MisDocumentUploadDto, MisDocumentUploadResultDto } from '@telemed/shared-types';
import { Button } from '@telemed/ui';
import { DocumentUploadModal } from './DocumentUploadModal';

export interface UploadDocumentsButtonProps {
  upload: (dto: MisDocumentUploadDto) => Promise<MisDocumentUploadResultDto>;
  // lobby — full-width outline button in the waiting-room card;
  // call  — an `.lk-button` icon for the LiveKit control bar.
  variant: 'lobby' | 'call';
  // Pass the call container when rendering inside the (pseudo-)fullscreen
  // video element so the modal is painted within that subtree.
  container?: HTMLElement | null;
}

/**
 * Opens the document upload modal. Render only when the appointment carries
 * `canUploadDocuments` — otherwise the API answers 409 mis_upload.not_configured.
 */
export const UploadDocumentsButton = ({
  upload,
  variant,
  container,
}: UploadDocumentsButtonProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'lobby' ? (
        <Button variant="outline" fullWidth onClick={() => setOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <PaperclipIcon />
            Надіслати документи
          </span>
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="lk-button"
          aria-label="Надіслати документи"
          title="Надіслати документи"
        >
          <PaperclipIcon />
        </button>
      )}
      <DocumentUploadModal
        open={open}
        onClose={() => setOpen(false)}
        upload={upload}
        container={container}
      />
    </>
  );
};

const PaperclipIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);
