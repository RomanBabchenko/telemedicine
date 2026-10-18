import { MIS_DOCUMENT_CONTENT_TYPES, type MisDocumentContentType } from '@telemed/shared-types';

/**
 * Reads a File into raw base64 (no `data:` prefix) — exactly what
 * POST /appointments/:id/mis-documents expects. Uses readAsDataURL rather than
 * readAsArrayBuffer + btoa: btoa on a 10 MB binary string is slow on phones
 * and the data-URL path is natively encoded by the browser.
 */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Не вдалося прочитати файл'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Не вдалося прочитати файл'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });

const BY_EXTENSION: Record<string, MisDocumentContentType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Content type to send for a picked file, or null when it is not one of the
 * allowed types. `File.type` is trusted when it is on the allowlist; iOS
 * Safari reports '' for HEIC photos and some Android pickers send
 * application/octet-stream, so fall back to the extension.
 */
export const resolveContentType = (file: File): MisDocumentContentType | null => {
  const declared = (file.type || '').toLowerCase();
  if ((MIS_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(declared)) {
    return declared as MisDocumentContentType;
  }
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return BY_EXTENSION[ext] ?? null;
};

// The API rejects path separators / control characters in fileName; browsers
// rarely produce them, but a share-sheet name like "scan 1/2" would 400.
export const sanitiseFileName = (name: string): string => {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (cleaned || 'file').slice(0, 255);
};
