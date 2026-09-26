import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppointmentStatus, ConsultationStatus } from '@telemed/shared-types';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { RecordingService } from '../../recording/application/recording.service';
import { ConsultationService, JOIN_CLOSES_AFTER_END_MS } from './consultation.service';

const BATCH_SIZE = 50;

/**
 * Closes consultations nobody ended. Only the doctor's explicit «Завершити»
 * completes an appointment, so a closed tab, «Відлучитися», a lost
 * connection or an unsubmitted documentation form left appointments
 * IN_PROGRESS forever (while their recordings finalised on their own).
 *
 * Every 5 minutes: IN_PROGRESS appointments whose join window has closed
 * (endAt + JOIN_CLOSES_AFTER_END_MS — nobody can (re)join anyway) are handed
 * to ConsultationService.autoEndIfAbandoned, which waits for an empty room
 * and stopped audio, then completes them with endReason AUTO_TIMEOUT.
 *
 * Second pass: recordings left open ("paused" — everyone had left while the
 * call could still resume) whose tracks have all stopped but whose session
 * is now over, or whose appointment moved on (e.g. NO_SHOW from MIS), are
 * merged — no egress_ended webhook will come to trigger it.
 */
@Injectable()
export class StaleConsultationSweeper {
  private readonly logger = new Logger(StaleConsultationSweeper.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
    private readonly consultations: ConsultationService,
    private readonly recordings: RecordingService,
  ) {}

  @Cron('*/5 * * * *')
  async sweep(now = new Date()): Promise<void> {
    // With N API instances the cron fires N times — one sweep is enough.
    if (!(await this.redis.setNxEx('cron-lock:stale-consultations', '1', 290))) return;

    await this.endAbandonedSessions(now);
    await this.finalizeIdleRecordings();
  }

  private async endAbandonedSessions(now: Date): Promise<void> {
    // Cross-tenant on purpose: a background job has no request tenant. Each
    // row is then processed inside its own tenant context below.
    const rows: Array<{ session_id: string; tenant_id: string }> = await this.dataSource.query(
      `SELECT s.id AS session_id, s.tenant_id
         FROM consultation_sessions s
         JOIN appointments a ON a.id = s.appointment_id
        WHERE a.status = $1
          AND a.end_at < $2
        ORDER BY a.end_at
        LIMIT $3`,
      [
        AppointmentStatus.IN_PROGRESS,
        new Date(now.getTime() - JOIN_CLOSES_AFTER_END_MS),
        BATCH_SIZE,
      ],
    );
    if (rows.length === 0) return;

    const tally: Record<string, number> = {};
    for (const row of rows) {
      try {
        const result = await this.tenantContext.run({ tenantId: row.tenant_id }, () =>
          this.consultations.autoEndIfAbandoned(row.session_id, now),
        );
        tally[result] = (tally[result] ?? 0) + 1;
      } catch (e) {
        tally.failed = (tally.failed ?? 0) + 1;
        this.logger.warn(`Auto-end failed for session ${row.session_id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`Stale consultations: ${JSON.stringify(tally)}`);
  }

  private async finalizeIdleRecordings(): Promise<void> {
    const rows: Array<{ recording_id: string }> = await this.dataSource.query(
      `SELECT r.id AS recording_id
         FROM session_recordings r
         JOIN consultation_sessions s ON s.id = r.session_id
         JOIN appointments a ON a.id = s.appointment_id
        WHERE r.status = 'RECORDING'
          AND (s.status = $1 OR a.status <> $2)
          AND NOT EXISTS (
            SELECT 1 FROM recording_egresses e
             WHERE e.recording_id = r.id AND e.status = 'RECORDING'
          )
        LIMIT $3`,
      [ConsultationStatus.ENDED, AppointmentStatus.IN_PROGRESS, BATCH_SIZE],
    );
    for (const row of rows) {
      try {
        await this.recordings.finalizeIfIdle(row.recording_id);
      } catch (e) {
        this.logger.warn(
          `Finalizing idle recording ${row.recording_id} failed: ${(e as Error).message}`,
        );
      }
    }
    if (rows.length > 0) this.logger.log(`Finalized ${rows.length} idle recording(s)`);
  }
}
