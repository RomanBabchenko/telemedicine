import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MIS_DOCUMENT_MAX_BYTES } from '@telemed/shared-types';
import {
  MIS_DOCUMENT_MAX_BASE64_LENGTH,
  UploadMisDocumentBodyDto,
} from '../upload-mis-document.body.dto';

const valid = {
  fileName: 'Аналізи 2026.pdf',
  contentType: 'application/pdf',
  sizeBytes: 11,
  contentBase64: Buffer.from('hello world').toString('base64'),
};

const validateDto = async (input: object) =>
  validate(plainToInstance(UploadMisDocumentBodyDto, input));

const failingProps = (errors: Awaited<ReturnType<typeof validateDto>>) =>
  errors.map((e) => e.property);

describe('UploadMisDocumentBodyDto', () => {
  it('accepts a well-formed body (unicode file names included)', async () => {
    expect(await validateDto(valid)).toHaveLength(0);
  });

  it('rejects a data: URL prefix — the client must send raw base64', async () => {
    const errors = await validateDto({
      ...valid,
      contentBase64: `data:application/pdf;base64,${valid.contentBase64}`,
    });
    expect(failingProps(errors)).toEqual(['contentBase64']);
  });

  it('rejects content types outside the allowlist', async () => {
    const errors = await validateDto({ ...valid, contentType: 'application/x-msdownload' });
    expect(failingProps(errors)).toEqual(['contentType']);
  });

  it('rejects sizeBytes above the 10 MiB cap and below 1', async () => {
    expect(
      failingProps(await validateDto({ ...valid, sizeBytes: MIS_DOCUMENT_MAX_BYTES + 1 })),
    ).toEqual(['sizeBytes']);
    expect(failingProps(await validateDto({ ...valid, sizeBytes: 0 }))).toEqual(['sizeBytes']);
  });

  it('rejects path separators and control characters in fileName', async () => {
    expect(failingProps(await validateDto({ ...valid, fileName: '../etc/passwd' }))).toEqual([
      'fileName',
    ]);
    expect(failingProps(await validateDto({ ...valid, fileName: 'a\u0000b.pdf' }))).toEqual([
      'fileName',
    ]);
    expect(failingProps(await validateDto({ ...valid, fileName: 'C:\\scan.png' }))).toEqual([
      'fileName',
    ]);
  });

  it('caps the base64 string at the encoded size of 10 MiB', () => {
    expect(MIS_DOCUMENT_MAX_BASE64_LENGTH).toBe(Math.ceil(MIS_DOCUMENT_MAX_BYTES / 3) * 4);
    expect(MIS_DOCUMENT_MAX_BASE64_LENGTH % 4).toBe(0);
  });
});
