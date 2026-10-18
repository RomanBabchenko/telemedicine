import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@telemed/shared-types';
import type { AuthUser } from '../../../../common/auth/decorators';
import { Appointment } from '../../../booking/domain/entities/appointment.entity';
import { UploadMisDocumentBodyDto } from '../../api/dto/upload-mis-document.body.dto';
import { assertDecodedSizeMatches, MisDocumentRelayService } from '../mis-document-relay.service';

// "hello world" → 11 bytes, one padding char.
const CONTENT_B64 = Buffer.from('hello world').toString('base64');

const makeBody = (overrides: Partial<UploadMisDocumentBodyDto> = {}): UploadMisDocumentBodyDto =>
  ({
    fileName: 'analysis.pdf',
    contentType: 'application/pdf',
    sizeBytes: 11,
    contentBase64: CONTENT_B64,
    ...overrides,
  }) as UploadMisDocumentBodyDto;

const makeAppt = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'a-1',
    tenantId: 't-1',
    patientId: 'p-1',
    isAnonymousPatient: false,
    misDocumentUploadUrl: 'https://hub.docdream.example/upload/dd-1',
    ...overrides,
  }) as unknown as Appointment;

const inviteAnonUser = {
  id: 'invite-pseudonym',
  roles: [Role.PATIENT],
  scope: 'invite-anon',
  inviteCtx: { appointmentId: 'a-1', consultationSessionId: 's-1' },
} as unknown as AuthUser;

const fullPatientUser = { id: 'u-1', roles: [Role.PATIENT], scope: 'full' } as unknown as AuthUser;
const fullDoctorUser = { id: 'u-d', roles: [Role.DOCTOR], scope: 'full' } as unknown as AuthUser;

type FetchImpl = (...args: unknown[]) => Promise<unknown>;

const okResponse = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body: { cancel: jest.fn().mockResolvedValue(undefined) },
});

const buildService = (opts: {
  appt?: Appointment | null;
  patient?: { id: string } | null;
  fetchImpl?: FetchImpl;
  allowInsecure?: boolean;
  externalId?: string | null;
}) => {
  const fetchMock = jest.fn(opts.fetchImpl ?? (async () => okResponse(200)));
  const service = new MisDocumentRelayService(
    {
      findOne: jest.fn().mockResolvedValue(opts.appt === undefined ? makeAppt() : opts.appt),
    } as never,
    { findOne: jest.fn().mockResolvedValue(opts.patient ?? null) } as never,
    {
      findOne: jest
        .fn()
        .mockResolvedValue(
          opts.externalId === null ? null : { externalId: opts.externalId ?? 'dd-1' },
        ),
    } as never,
    { getTenantId: () => 't-1' } as never,
    { misUpload: { timeoutMs: 1000, allowInsecure: opts.allowInsecure ?? false } } as never,
    fetchMock as never,
  );
  return { service, fetchMock };
};

describe('MisDocumentRelayService.relay', () => {
  it('404s when the appointment is not in the tenant', async () => {
    const { service } = buildService({ appt: null });
    await expect(service.relay('a-1', inviteAnonUser, makeBody())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403s a doctor even with a full session', async () => {
    const { service, fetchMock } = buildService({});
    await expect(service.relay('a-1', fullDoctorUser, makeBody())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403s a full-session patient who does not own the appointment', async () => {
    const { service } = buildService({ patient: { id: 'p-other' } });
    await expect(service.relay('a-1', fullPatientUser, makeBody())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('403s an invite token pinned to another appointment', async () => {
    const { service } = buildService({});
    const other = {
      ...inviteAnonUser,
      inviteCtx: { appointmentId: 'a-2', consultationSessionId: 's-2' },
    } as AuthUser;
    await expect(service.relay('a-1', other, makeBody())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows the owning full-session patient', async () => {
    const { service, fetchMock } = buildService({ patient: { id: 'p-1' } });
    await expect(service.relay('a-1', fullPatientUser, makeBody())).resolves.toEqual({
      delivered: true,
      upstreamStatus: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('409s with mis_upload.not_configured when the appointment has no upload URL', async () => {
    const { service, fetchMock } = buildService({
      appt: makeAppt({ misDocumentUploadUrl: null }),
    });
    const err = await service.relay('a-1', inviteAnonUser, makeBody()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'mis_upload.not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s when sizeBytes disagrees with the decoded base64 length', async () => {
    const { service, fetchMock } = buildService({});
    const err = await service
      .relay('a-1', inviteAnonUser, makeBody({ sizeBytes: 12 }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      code: 'mis_upload.size_mismatch',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a private-network upload URL unless insecure mode is on', async () => {
    const appt = makeAppt({ misDocumentUploadUrl: 'http://localhost:4100/upload/x' });
    const strict = buildService({ appt });
    await expect(strict.service.relay('a-1', inviteAnonUser, makeBody())).rejects.toBeInstanceOf(
      ConflictException,
    );
    const dev = buildService({ appt, allowInsecure: true });
    await expect(dev.service.relay('a-1', inviteAnonUser, makeBody())).resolves.toMatchObject({
      delivered: true,
    });
  });

  it('POSTs the MIS contract payload once, without following redirects', async () => {
    const { service, fetchMock } = buildService({});
    await service.relay('a-1', inviteAnonUser, makeBody());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://hub.docdream.example/upload/dd-1');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');

    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      appointmentId: 'a-1',
      externalAppointmentId: 'dd-1',
      tenantId: 't-1',
      uploadedBy: 'PATIENT',
      fileName: 'analysis.pdf',
      contentType: 'application/pdf',
      sizeBytes: 11,
      contentBase64: CONTENT_B64,
    });
    expect(typeof sent.uploadedAt).toBe('string');
  });

  it('sends externalAppointmentId: null when no MIS mapping exists', async () => {
    const { service, fetchMock } = buildService({ externalId: null });
    await service.relay('a-1', inviteAnonUser, makeBody());
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string).externalAppointmentId).toBeNull();
  });

  it('502s with the upstream status when the MIS rejects the file', async () => {
    const { service } = buildService({ fetchImpl: async () => okResponse(500) });
    const err = await service.relay('a-1', inviteAnonUser, makeBody()).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect((err as BadGatewayException).getResponse()).toMatchObject({
      code: 'mis_upload.rejected',
      details: { upstreamStatus: 500 },
    });
  });

  it('504s when the MIS endpoint is unreachable or times out', async () => {
    const { service } = buildService({
      fetchImpl: async () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
    });
    const err = await service.relay('a-1', inviteAnonUser, makeBody()).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayTimeoutException);
    expect((err as GatewayTimeoutException).getResponse()).toMatchObject({
      code: 'mis_upload.unreachable',
    });
  });
});

describe('assertDecodedSizeMatches', () => {
  it.each([
    ['no padding', Buffer.from('abc').toString('base64'), 3],
    ['one pad', Buffer.from('ab').toString('base64'), 2],
    ['two pads', Buffer.from('a').toString('base64'), 1],
  ])('accepts %s', (_label, b64, size) => {
    expect(() =>
      assertDecodedSizeMatches(makeBody({ contentBase64: b64, sizeBytes: size })),
    ).not.toThrow();
  });

  it('rejects a length that is not a multiple of 4', () => {
    expect(() =>
      assertDecodedSizeMatches(makeBody({ contentBase64: 'abcde', sizeBytes: 3 })),
    ).toThrow(BadRequestException);
  });
});
