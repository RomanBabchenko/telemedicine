import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Repository } from 'typeorm';
import { AppConfig } from '../../../config/env.config';
import { MinioService } from '../../../infrastructure/minio/minio.service';
import { RecordingEgress } from '../domain/entities/recording-egress.entity';
import { SessionRecording } from '../domain/entities/session-recording.entity';
import {
  MergeJobData,
  RECORDING_MERGE_QUEUE,
} from './recording.service';

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FINAL_KEY = (tenantId: string, sessionId: string): string =>
  `${tenantId}/recordings/${sessionId}.mp3`;

@Processor(RECORDING_MERGE_QUEUE, {
  // concurrency=1 by default — see plan: t3.medium can't sustain parallel
  // ffmpeg + Node API + Postgres without throttling. Bump via env on bigger
  // instances.
  concurrency: Number(process.env.RECORDING_MERGE_CONCURRENCY ?? 1),
})
export class RecordingMergeProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(RecordingMergeProcessor.name);

  constructor(
    @InjectRepository(SessionRecording)
    private readonly recordings: Repository<SessionRecording>,
    @InjectRepository(RecordingEgress)
    private readonly egresses: Repository<RecordingEgress>,
    private readonly minio: MinioService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  onModuleInit(): void {
    this.logger.log(
      `RecordingMergeProcessor ready: queue=${RECORDING_MERGE_QUEUE} concurrency=${process.env.RECORDING_MERGE_CONCURRENCY ?? 1} ffmpeg=${FFMPEG_BIN}`,
    );
  }

  @OnWorkerEvent('active')
  onActive(job: Job<MergeJobData>): void {
    this.logger.log(`merge job ${job.id} starting (recordingId=${job.data.recordingId})`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<MergeJobData>): void {
    this.logger.log(`merge job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MergeJobData> | undefined, err: Error): void {
    this.logger.error(
      `merge job ${job?.id ?? '?'} failed (attempt ${job?.attemptsMade ?? '?'}): ${err.message}`,
      err.stack,
    );
  }

  async process(job: Job<MergeJobData>): Promise<void> {
    const { recordingId } = job.data;
    const recording = await this.recordings.findOne({ where: { id: recordingId } });
    if (!recording) {
      this.logger.warn(`merge job for unknown recordingId=${recordingId} — dropping`);
      return;
    }
    if (recording.status === 'STORED') {
      this.logger.log(`merge: recording ${recordingId} already STORED — skipping`);
      return;
    }

    const finalKey = FINAL_KEY(recording.tenantId, recording.sessionId);

    // Idempotency: a previous attempt may have uploaded the MP3 but crashed
    // before flipping the DB row. Treat existing object as success.
    try {
      const stat = await this.minio.statObject(finalKey);
      if (stat.size > 0) {
        recording.status = 'STORED';
        await this.recordings.save(recording);
        this.logger.log(`merge: recording ${recordingId} already in MinIO — flipped to STORED`);
        return;
      }
    } catch {
      // not found, proceed
    }

    const inputs = await this.egresses.find({
      where: { recordingId, status: 'STORED' },
    });
    if (inputs.length === 0) {
      recording.status = 'FAILED';
      await this.recordings.save(recording);
      this.logger.warn(`merge: recording ${recordingId} has zero STORED tracks — marked FAILED`);
      return;
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `merge-${recordingId}-`));
    try {
      // Compute per-input delay relative to the earliest started egress so
      // that participants who reconnect mid-call (each reconnect is a NEW
      // trackSid → NEW egress → NEW OGG starting at its own t=0) are placed
      // at the correct position on the merged timeline. Without this, a
      // reconnect's audio would overlap the original's timeline from t=0
      // instead of resuming where the disconnect happened.
      const localPaths: string[] = [];
      const delays = computeInputDelaysMs(inputs);
      for (const e of inputs) {
        const local = path.join(workDir, `${e.trackSid}.ogg`);
        const stream = await this.minio
          .raw()
          .getObject(this.config.minio.bucket, e.objectKey);
        await pipeline(stream, createWriteStream(local));
        localPaths.push(local);
      }

      const outPath = path.join(workDir, 'out.mp3');
      await this.runFfmpeg(localPaths, delays, outPath);

      const outStat = await fs.stat(outPath);
      await this.minio.putObject({
        objectKey: finalKey,
        buffer: createReadStream(outPath),
        size: outStat.size,
        contentType: 'audio/mpeg',
      });

      // Best-effort cleanup of intermediates. A leftover file just costs
      // storage; the next merge attempt is idempotent on the final key.
      for (const e of inputs) {
        try {
          await this.minio.removeObject(e.objectKey);
        } catch (err) {
          this.logger.warn(
            `merge: could not delete intermediate ${e.objectKey}: ${(err as Error).message}`,
          );
        }
      }

      recording.status = 'STORED';
      // Total wall-clock duration of the call = furthest endpoint on the
      // merged timeline. Each input's endpoint is delay_i + duration_i.
      const totalDuration = Math.max(
        ...inputs.map((i, idx) =>
          Math.round(delays[idx] / 1000) + (i.durationSec || 0),
        ),
        0,
      );
      if (totalDuration > 0) recording.durationSec = totalDuration;
      await this.recordings.save(recording);

      this.logger.log(
        `merged recording ${recordingId} from ${inputs.length} track(s) -> ${finalKey} (${outStat.size} bytes)`,
      );
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  private runFfmpeg(inputs: string[], delaysMs: number[], output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [];
      for (const f of inputs) args.push('-i', f);

      args.push(
        '-filter_complex', buildAmixFilter(inputs.length, delaysMs),
        '-codec:a', 'libmp3lame',
        '-b:a', '128k',
        '-y',
        output,
      );

      const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', (err) => {
        // ENOENT = ffmpeg binary not installed on PATH
        reject(err);
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
        }
      });
    });
  }
}

/**
 * Per-input delay relative to the earliest egress in the set, in ms.
 * Reconnects produce new RecordingEgress rows whose `startedAt` is later
 * than the original participant's row; this offset is what pushes their
 * audio to the right place on the merged timeline so they don't overlap
 * with their pre-disconnect track.
 */
export function computeInputDelaysMs(
  inputs: Array<{ startedAt: Date | null }>,
): number[] {
  if (inputs.length === 0) return [];
  const startedAtMs = inputs.map((i) => (i.startedAt ? i.startedAt.getTime() : 0));
  const earliest = Math.min(...startedAtMs);
  return startedAtMs.map((t) => Math.max(0, t - earliest));
}

/**
 * ffmpeg -filter_complex graph: pad each input with adelay, then amix.
 *
 *   [0:a]adelay=0:all=1[a0];[1:a]adelay=12000:all=1[a1];[a0][a1]amix=inputs=2...
 *
 * - `all=1` applies the same delay to every channel of the input (mono Opus
 *   has 1 channel, but being explicit avoids surprises if LiveKit ever
 *   negotiates stereo).
 * - `duration=longest` keeps the full call even if one participant left early.
 * - `dropout_transition=0` disables amix's auto-ducking, which would
 *   otherwise raise the level of remaining tracks when one drops out and
 *   make the recording sound uneven.
 */
export function buildAmixFilter(inputCount: number, delaysMs: number[]): string {
  const labels: string[] = [];
  const parts: string[] = [];
  for (let i = 0; i < inputCount; i++) {
    const delay = delaysMs[i] ?? 0;
    const label = `a${i}`;
    parts.push(`[${i}:a]adelay=${delay}:all=1[${label}]`);
    labels.push(`[${label}]`);
  }
  parts.push(
    `${labels.join('')}amix=inputs=${inputCount}:duration=longest:dropout_transition=0`,
  );
  return parts.join(';');
}
