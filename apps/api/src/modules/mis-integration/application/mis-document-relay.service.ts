import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from '@telemed/shared-types';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../../common/auth/decorators';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppConfig } from '../../../config/env.config';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { UploadMisDocumentBodyDto } from '../api/dto/upload-mis-document.body.dto';
import { UploadMisDocumentResponseDto } from '../api/dto/upload-mis-document.response.dto';
import { ExternalIdentity } from '../domain/entities/external-identity.entity';
import { assertSafeUploadUrl } from './upload-url.guard';

// Injection token for the outbound HTTP function — tests pass a stub, the
// app falls back to the Node global fetch.
export const MIS_UPLOAD_FETCH = Symbol('MIS_UPLOAD_FETCH');
export type FetchFn = typeof globalThis.fetch;

/**
 * What the MIS hub receives for every file. Mirrors the contract in
 * docs/integrations/docdream.md — change both together.
 */
export interface MisDocumentUploadPayload {
  appointmentId: string;
  externalAppointmentId: string | null;
  tenantId: string;
  uploadedBy: 'PATIENT';
  fileName: string;
  contentType: string;
  sizeBytes: number;
  contentBase64: string;
  uploadedAt: string;
}

/**
 * Relays a patient document to the per-appointment upload URL the MIS sent
 * at appointment creation. Nothing is persisted here: the base64 body goes
 * straight from the request into one outbound POST.
 */
@Injectable()
export class MisDocumentRelayService {
  private readonly logger = new Logger(MisDocumentRelayService.name);
  private readonly fetchFn: FetchFn;

  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Patient)
    private readonly patients: Repository<Patient>,
    @InjectRepository(ExternalIdentity)
    private readonly externalIds: Repository<ExternalIdentity>,
    private readonly tenantContext: TenantContextService,
    private readonly config: AppConfig,
    @Optional() @Inject(MIS_UPLOAD_FETCH) fetchFn?: FetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async relay(
    appointmentId: string,
    user: AuthUser,
    body: UploadMisDocumentBodyDto,
  ): Promise<UploadMisDocumentResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const appt = await this.appointments.findOne({ where: { id: appointmentId, tenantId } });
    if (!appt) throw new NotFoundException('Appointment not found');

    await this.assertPatientParticipant(appt, user);

    if (!appt.misDocumentUploadUrl) {
      throw new ConflictException({
        message: 'Document upload is not configured for this appointment',
        code: 'mis_upload.not_configured',
      });
    }

    assertDecodedSizeMatches(body);

    const { allowInsecure, timeoutMs } = this.config.misUpload;
    const target = assertSafeUploadUrl(appt.misDocumentUploadUrl, allowInsecure);

    const mapping = await this.externalIds.findOne({
      where: { tenantId, entityType: 'APPOINTMENT', internalId: appt.id },
    });

    const payload: MisDocumentUploadPayload = {
      appointmentId: appt.id,
      externalAppointmentId: mapping?.externalId ?? null,
      tenantId,
      uploadedBy: 'PATIENT',
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      contentBase64: body.contentBase64,
      uploadedAt: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(target, {
        method: 'POST',
        // A 30x to an internal address would bypass the host check above.
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Never log the body — it carries the file. Host + error name is enough.
      this.logger.warn(
        `MIS upload unreachable appointment=${appt.id} host=${target.host}: ${
          (e as Error).name ?? 'Error'
        }`,
      );
      throw new GatewayTimeoutException({
        message: 'Сервер клініки не відповідає. Спробуйте ще раз пізніше.',
        code: 'mis_upload.unreachable',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      this.logger.warn(
        `MIS upload rejected appointment=${appt.id} host=${target.host} status=${res.status}`,
      );
      throw new BadGatewayException({
        message: 'Сервер клініки відхилив документ. Спробуйте ще раз або зверніться до клініки.',
        code: 'mis_upload.rejected',
        details: { upstreamStatus: res.status },
      });
    }
    await res.body?.cancel().catch(() => undefined);

    this.logger.log(
      `MIS upload delivered appointment=${appt.id} host=${target.host} bytes=${body.sizeBytes} status=${res.status}`,
    );
    return { delivered: true, upstreamStatus: res.status };
  }

  /**
   * Only the appointment's own patient may relay files. Invite tokens are
   * already pinned to one appointment by JwtAuthGuard (@InviteAccessible);
   * full sessions need an explicit Patient ↔ appointment check because
   * AppointmentService lookups are tenant-scoped only.
   */
  private async assertPatientParticipant(appt: Appointment, user: AuthUser): Promise<void> {
    const deny = (why: string) =>
      new ForbiddenException({
        message: 'Only the patient of this appointment may upload documents',
        code: 'mis_upload.forbidden',
        details: { why },
      });

    if (!user.roles.includes(Role.PATIENT)) throw deny('not_patient');

    if (user.scope === 'invite' || user.scope === 'invite-anon') {
      if (user.inviteCtx?.appointmentId !== appt.id) throw deny('invite_mismatch');
      return;
    }
    if (user.scope && user.scope !== 'full') throw deny('scope');

    if (!appt.patientId) throw deny('anonymous_appointment');
    const patient = await this.patients.findOne({ where: { userId: user.id } });
    if (!patient || patient.id !== appt.patientId) throw deny('not_owner');
  }
}

// Base64 length arithmetic instead of decoding: the DTO already proved the
// alphabet, so `len * 3 / 4 - padding` is exact and costs nothing.
export const assertDecodedSizeMatches = (body: UploadMisDocumentBodyDto): void => {
  const len = body.contentBase64.length;
  if (len % 4 !== 0) {
    throw new BadRequestException({
      message: 'contentBase64 is not valid base64 (length not a multiple of 4)',
      code: 'mis_upload.bad_base64',
    });
  }
  const padding = body.contentBase64.endsWith('==') ? 2 : body.contentBase64.endsWith('=') ? 1 : 0;
  const decoded = (len * 3) / 4 - padding;
  if (decoded !== body.sizeBytes) {
    throw new BadRequestException({
      message: 'sizeBytes does not match the decoded length of contentBase64',
      code: 'mis_upload.size_mismatch',
      details: { sizeBytes: body.sizeBytes, decodedBytes: decoded },
    });
  }
};
