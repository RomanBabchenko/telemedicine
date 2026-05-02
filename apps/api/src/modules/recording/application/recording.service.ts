import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { QueryFailedError, Repository } from 'typeorm';
import { ConsentStatus, ConsentType } from '@telemed/shared-types';
import { SessionRecording } from '../domain/entities/session-recording.entity';
import { RecordingEgress } from '../domain/entities/recording-egress.entity';
import { ConsultationSession } from '../../consultation/domain/entities/consultation-session.entity';
import { Consent } from '../../patient/domain/entities/consent.entity';
import { Tenant } from '../../tenant/domain/entities/tenant.entity';
import { LiveKitClientService } from '../../../infrastructure/livekit/livekit-client.service';
import { MinioService } from '../../../infrastructure/minio/minio.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

// Final merged file extension. Per-track intermediates are OGG (Opus
// passthrough from LiveKit); the merge job transcodes to MP3 because that's
// what MIS DocDream consumes from the download URL.
const RECORDING_OBJECT_EXT = 'mp3';
const recordingObjectKey = (tenantId: string, sessionId: string): string =>
  `${tenantId}/recordings/${sessionId}.${RECORDING_OBJECT_EXT}`;
const intermediateKey = (tenantId: string, sessionId: string, trackSid: string): string =>
  `${tenantId}/recordings/intermediate/${sessionId}/${trackSid}.ogg`;

export const RECORDING_MERGE_QUEUE = 'recording-merge';
export const RECORDING_MERGE_JOB = 'merge';

export interface MergeJobData {
  recordingId: string;
}

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);

  constructor(
    @InjectRepository(SessionRecording) private readonly recordings: Repository<SessionRecording>,
    @InjectRepository(RecordingEgress) private readonly egresses: Repository<RecordingEgress>,
    @InjectRepository(ConsultationSession)
    private readonly sessions: Repository<ConsultationSession>,
    @InjectRepository(Consent) private readonly consents: Repository<Consent>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly livekit: LiveKitClientService,
    private readonly minio: MinioService,
    private readonly tenantContext: TenantContextService,
    @InjectQueue(RECORDING_MERGE_QUEUE) private readonly mergeQueue: Queue<MergeJobData>,
  ) {}

  async start(sessionId: string, consentId: string): Promise<SessionRecording> {
    const tenantId = this.tenantContext.getTenantId();

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!tenant.audioPolicy?.enabled) {
      throw new ForbiddenException('Audio recording is disabled for this tenant');
    }

    const consent = await this.consents.findOne({ where: { id: consentId, tenantId } });
    if (
      !consent ||
      consent.type !== ConsentType.AUDIO_RECORDING ||
      consent.status !== ConsentStatus.GRANTED
    ) {
      throw new BadRequestException('Audio recording consent is required');
    }

    const session = await this.sessions.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException('Session not found');

    const retentionDays = tenant.audioPolicy?.retentionDays ?? 30;
    const retentionUntil = new Date(Date.now() + retentionDays * 86400_000);

    const saved = await this.createRecordingRow(
      tenantId,
      session,
      consent.id,
      retentionUntil,
    );
    await this.startTrackEgressesForRecording(saved, session.livekitRoomName);
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

    // Already recording — idempotent. Still try the catch-up enumeration in
    // case a track was published between the original start and now (e.g.
    // participant unmuted late) and didn't trigger a webhook in time.
    const existing = await this.recordings.findOne({ where: { sessionId, tenantId } });
    if (existing) {
      if (existing.status === 'RECORDING') {
        await this.startTrackEgressesForRecording(existing, session.livekitRoomName);
      }
      return existing;
    }

    const retentionUntil = new Date(Date.now() + 30 * 86400_000);
    const saved = await this.createRecordingRow(tenantId, session, null, retentionUntil);
    await this.startTrackEgressesForRecording(saved, session.livekitRoomName);
    this.logger.log(`Auto-recording started for session ${sessionId}`);
    return saved;
  }

  async stop(sessionId: string): Promise<SessionRecording | null> {
    const tenantId = this.tenantContext.getTenantId();
    const recording = await this.recordings.findOne({ where: { sessionId, tenantId } });
    if (!recording) return null;

    const inflight = await this.egresses.find({
      where: { recordingId: recording.id, status: 'RECORDING' },
    });
    for (const e of inflight) {
      try {
        await this.livekit.stopEgress(e.egressId);
      } catch (err) {
        this.logger.warn(
          `stopEgress failed for ${e.egressId}: ${(err as Error).message}`,
        );
      }
    }

    // Don't flip SessionRecording.status here — egress_ended webhooks are the
    // authoritative completion signal, and the merge job (scheduled when the
    // last egress finishes) is what eventually flips status to STORED.
    return recording;
  }

  /**
   * Called from the LiveKit `egress_ended` webhook. Marks the per-track row
   * terminal and, when all siblings are terminal, schedules the merge job.
   * Webhooks have no tenant context — we look up by globally-unique egressId.
   *
   * @param failed - true if EgressInfo.status was EGRESS_FAILED / ABORTED
   */
  async handleEgressEnded(
    egressId: string,
    durationSec: number | null,
    failed = false,
  ): Promise<void> {
    const re = await this.egresses.findOne({ where: { egressId } });
    if (!re) {
      this.logger.warn(`egress_ended for unknown egressId=${egressId} — ignored`);
      return;
    }
    if (re.status !== 'RECORDING') return; // already finalised, idempotent

    re.status = failed ? 'FAILED' : 'STORED';
    if (durationSec !== null && Number.isFinite(durationSec) && durationSec > 0) {
      re.durationSec = Math.round(durationSec);
    }
    re.endedAt = new Date();
    await this.egresses.save(re);

    await this.maybeScheduleMerge(re.recordingId);
  }

  /**
   * Called from the LiveKit `track_published` webhook. Starts a passthrough
   * egress for any new audio track on a room that already has an active
   * recording. No-op for video tracks or when no recording is in flight.
   *
   * Webhook is anonymous — we look up the session by its (indexed) room name
   * and read tenantId from the recording row.
   */
  async handleTrackPublished(
    roomName: string,
    participantIdentity: string,
    trackSid: string,
    trackKind: 'AUDIO' | 'VIDEO' | 'DATA',
  ): Promise<void> {
    if (trackKind !== 'AUDIO') {
      this.logger.debug(
        `track_published: skip non-audio (room=${roomName}, track=${trackSid}, kind=${trackKind})`,
      );
      return;
    }

    const session = await this.sessions.findOne({ where: { livekitRoomName: roomName } });
    if (!session) {
      this.logger.warn(`track_published: no session for room=${roomName} (track=${trackSid})`);
      return;
    }
    if (!session.recordingId) {
      this.logger.log(
        `track_published: session ${session.id} has no active recording yet — track ${trackSid} will be picked up by startAuto's catch-up`,
      );
      return;
    }
    const recording = await this.recordings.findOne({ where: { id: session.recordingId } });
    if (!recording) {
      this.logger.warn(
        `track_published: recording ${session.recordingId} (session ${session.id}) not found`,
      );
      return;
    }
    if (recording.status !== 'RECORDING') {
      this.logger.log(
        `track_published: recording ${recording.id} is ${recording.status}, ignoring late track ${trackSid}`,
      );
      return;
    }

    this.logger.log(
      `track_published: starting per-track egress for ${participantIdentity}/${trackSid} on recording ${recording.id}`,
    );
    await this.startOneTrackEgress(
      recording,
      session.livekitRoomName,
      participantIdentity,
      trackSid,
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

  // ---------- internals ----------

  private async createRecordingRow(
    tenantId: string,
    session: ConsultationSession,
    consentId: string | null,
    retentionUntil: Date,
  ): Promise<SessionRecording> {
    const recording = this.recordings.create({
      tenantId,
      sessionId: session.id,
      consentId,
      egressId: null, // legacy column; per-track egressIds live on recording_egresses
      retentionUntil,
      status: 'RECORDING',
    });
    const saved = await this.recordings.save(recording);
    if (session.recordingId !== saved.id) {
      session.recordingId = saved.id;
      await this.sessions.save(session);
    }
    return saved;
  }

  private async startTrackEgressesForRecording(
    recording: SessionRecording,
    roomName: string,
  ): Promise<void> {
    const tracks = await this.livekit.listAudioTracks(roomName);
    this.logger.log(
      `catch-up: room=${roomName} found ${tracks.length} audio track(s) [${tracks
        .map((t) => `${t.identity}/${t.trackSid}`)
        .join(', ')}]`,
    );
    for (const t of tracks) {
      await this.startOneTrackEgress(recording, roomName, t.identity, t.trackSid);
    }
  }

  private async startOneTrackEgress(
    recording: SessionRecording,
    roomName: string,
    participantIdentity: string,
    trackSid: string,
  ): Promise<RecordingEgress | null> {
    // Idempotency: catch-up + track_published webhook can race.
    const existing = await this.egresses.findOne({
      where: { recordingId: recording.id, trackSid },
    });
    if (existing) return existing;

    const objectKey = intermediateKey(recording.tenantId, recording.sessionId, trackSid);
    const { egressId } = await this.livekit.startAudioTrackEgress(
      roomName,
      trackSid,
      objectKey,
    );
    this.logger.log(
      `startTrackEgress: track=${trackSid} participant=${participantIdentity} egressId=${egressId}`,
    );
    try {
      return await this.egresses.save(
        this.egresses.create({
          tenantId: recording.tenantId,
          recordingId: recording.id,
          egressId,
          participantIdentity,
          trackSid,
          objectKey,
          status: 'RECORDING',
          startedAt: new Date(),
        }),
      );
    } catch (e) {
      // Concurrent insert from a webhook racing with catch-up. Re-fetch and
      // return the row that won. We don't try to roll back the LiveKit-side
      // egress that we just started — the duplicate will get its egress_ended
      // webhook ignored (no matching row), and the upload bytes are harmless
      // because the second egress writes to the same object key as the first.
      if (e instanceof QueryFailedError) {
        return this.egresses.findOne({
          where: { recordingId: recording.id, trackSid },
        });
      }
      throw e;
    }
  }

  private async maybeScheduleMerge(recordingId: string): Promise<void> {
    const all = await this.egresses.find({ where: { recordingId } });
    const stillRunning = all.some((e) => e.status === 'RECORDING');
    if (stillRunning) return;

    const recording = await this.recordings.findOne({ where: { id: recordingId } });
    if (!recording) return;
    if (recording.status !== 'RECORDING') return; // already merging or terminal

    const stored = all.filter((e) => e.status === 'STORED');
    if (stored.length === 0) {
      recording.status = 'FAILED';
      await this.recordings.save(recording);
      return;
    }

    recording.status = 'MERGING';
    await this.recordings.save(recording);

    await this.mergeQueue.add(
      RECORDING_MERGE_JOB,
      { recordingId },
      {
        // BullMQ rejects ':' in custom jobIds (reserved for internal Redis
        // key namespacing), so use '-' as the separator. The id is the
        // dedupe key — re-enqueueing for the same recording is a no-op.
        jobId: `merge-${recordingId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86_400 },
        removeOnFail: false,
      },
    );
    this.logger.log(
      `Scheduled merge for recording ${recordingId} from ${stored.length} track(s)`,
    );
  }
}
