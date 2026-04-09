import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SessionRecording } from '../domain/entities/session-recording.entity';

@Injectable()
export class RetentionCleaner {
  private readonly logger = new Logger(RetentionCleaner.name);

  constructor(
    @InjectRepository(SessionRecording) private readonly recordings: Repository<SessionRecording>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<void> {
    const expired = await this.recordings.find({
      where: { retentionUntil: LessThan(new Date()) },
      take: 100,
    });
    if (expired.length === 0) return;
    this.logger.log(`Removing ${expired.length} recordings past their retention date`);
    await this.recordings.update(
      expired.map((r) => r.id),
      { status: 'EXPIRED' },
    );
  }
}
