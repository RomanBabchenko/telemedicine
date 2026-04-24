import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentStatus, ConsentType } from '@telemed/shared-types';
import { SessionRecording } from '../domain/entities/session-recording.entity';
import { ConsultationSession } from '../../consultation/domain/entities/consultation-session.entity';
import { Consent } from '../../patient/domain/entities/consent.entity';
import { Tenant } from '../../tenant/domain/entities/tenant.entity';
import { LiveKitClientService } from '../../../infrastructure/livekit/livekit-client.service';
import { MinioService } from '../../../infrastructure/minio/minio.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

// MP3 is the container/codec we ask LiveKit Egress to produce (see
// LiveKitClientService.startAudioEgress). Keep this in sync: if egress ever
// emits a different fileType, update the extension here too.
const RECORDING_OBJECT_EXT = 'mp3';
const recordingObjectKey = (tenantId: string, sessionId: string): string =>
  `${tenantId}/recordings/${sessionId}.${RECORDING_OBJECT_EXT}`;

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);

  constructor(
    @InjectRepository(SessionRecording) private readonly recordings: Repository<SessionRecording>,
    @InjectRepository(ConsultationSession)
    private readonly sessions: Repository<ConsultationSession>,
    @InjectRepository(Consent) private readonly consents: Repository<Consent>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly livekit: LiveKitClientService,
    private readonly minio: MinioService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async start(sessionId: string, consentId: string): Promise<SessionRecording> {
    const tenantId = this.tenantContext.getTenantId();

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!tenant.audioPolicy?.enabled) {
      throw new ForbiddenException('Audio recording is disabled for this tenant');
    }

    const consent = await this.consents.findOne({ where: { id: consentId, tenantId } });
    if (!consent || consent.type !== ConsentType.AUDIO_RECORDING || consent.status !== ConsentStatus.GRANTED) {
      throw new BadRequestException('Audio recording consent is required');
    }

    const session = await this.sessions.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException('Session not found');

    const objectKey = recordingObjectKey(tenantId, session.id);
    const { egressId } = await this.livekit.startAudioEgress(session.livekitRoomName, objectKey);

    const retentionDays = tenant.audioPolicy?.retentionDays ?? 30;
    const retentionUntil = new Date(Date.now() + retentionDays * 86400_000);

    const recording = this.recordings.create({
      tenantId,
      sessionId: session.id,
      consentId: consent.id,
      egressId,
      retentionUntil,
      status: 'RECORDING',
    });
    const saved = await this.recordings.save(recording);
    session.recordingId = saved.id;
    await this.sessions.save(session);
    return saved;
  }

  /**
   * Auto-start recording when a session becomes ACTIVE.
   * Skips consent and audioPolicy checks — used for automatic recording.
   */
  async startAuto(sessionId: string): Promise<SessionRecording> {
    const tenantId = this.tenantContext.getTenantId();

    const session = await this.sessions.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException('Session not found');

    // Already recording — idempotent
    const existing = await this.recordings.findOne({ where: { sessionId, tenantId } });
    if (existing) return existing;

    const objectKey = recordingObjectKey(tenantId, session.id);
    const { egressId } = await this.livekit.startAudioEgress(session.livekitRoomName, objectKey);

    const retentionUntil = new Date(Date.now() + 30 * 86400_000);

    const recording = this.recordings.create({
      tenantId,
      sessionId: session.id,
      consentId: null,
      egressId,
      retentionUntil,
      status: 'RECORDING',
    });
    const saved = await this.recordings.save(recording);
    session.recordingId = saved.id;
    await this.sessions.save(session);
    this.logger.log(`Auto-recording started for session ${sessionId}, egress: ${egressId}`);
    return saved;
  }

  async stop(sessionId: string): Promise<SessionRecording | null> {
    const tenantId = this.tenantContext.getTenantId();
    const recording = await this.recordings.findOne({ where: { sessionId, tenantId } });
    if (!recording) return null;
    if (recording.egressId) await this.livekit.stopEgress(recording.egressId);
    // NB: the row is also finalised (with real duration) by the egress_ended
    // LiveKit webhook. This local write is a belt-and-suspenders fallback for
    // environments where the webhook doesn't reach us (no host.docker.internal
    // routing, dev with webhook disabled, etc.). The webhook's save happens
    // idempotently — whichever write lands second just overwrites with the
    // same STORED status and a more accurate durationSec.
    recording.status = 'STORED';
    return this.recordings.save(recording);
  }

  /**
   * Called from the LiveKit `egress_ended` webhook. This is the authoritative
   * signal that the MP3 has been fully written to MinIO — LiveKit only fires
   * this after the egress pipeline flushes the file. Carries a real duration
   * that RecordingService.stop() has no source for.
   *
   * Idempotent: if stop() already flipped status to STORED, we just update
   * durationSec. If this fires first (user closed the tab without calling
   * /end), we finalise the row here so getRecordingInfo stops saying
   * "RECORDING" forever.
   *
   * Looked up by egressId — no tenant context needed, which matters because
   * webhook requests have no user session.
   */
  async handleEgressEnded(egressId: string, durationSec: number | null): Promise<void> {
    const recording = await this.recordings.findOne({ where: { egressId } });
    if (!recording) {
      this.logger.warn(`egress_ended for unknown egressId=${egressId} — ignored`);
      return;
    }
    recording.status = 'STORED';
    if (durationSec !== null && Number.isFinite(durationSec) && durationSec > 0) {
      recording.durationSec = Math.round(durationSec);
    }
    await this.recordings.save(recording);
    this.logger.log(
      `Recording ${recording.id} finalised via egress_ended webhook (duration=${recording.durationSec}s)`,
    );
  }

  async getRecordingInfo(sessionId: string): Promise<{
    recordingId: string;
    status: string;
    durationSec: number;
    downloadUrl: string | null;
  } | null> {
    const tenantId = this.tenantContext.getTenantId();
    const recording = await this.recordings.findOne({ where: { sessionId, tenantId } });
    if (!recording) return null;

    let downloadUrl: string | null = null;
    if (recording.status === 'STORED') {
      const objectKey = recordingObjectKey(tenantId, sessionId);
      try {
        downloadUrl = await this.minio.presignedGet(objectKey);
      } catch {
        // file may not exist yet
      }
    }

    return {
      recordingId: recording.id,
      status: recording.status,
      durationSec: recording.durationSec,
      downloadUrl,
    };
  }
}
