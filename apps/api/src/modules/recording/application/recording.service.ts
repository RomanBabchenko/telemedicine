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

    const objectKey = `${tenantId}/recordings/${session.id}.ogg`;
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

    const objectKey = `${tenantId}/recordings/${session.id}.ogg`;
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
    recording.status = 'STORED';
    return this.recordings.save(recording);
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
      const objectKey = `${tenantId}/recordings/${sessionId}.ogg`;
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
