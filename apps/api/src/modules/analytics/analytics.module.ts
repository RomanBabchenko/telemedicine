import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsEvent } from './domain/entities/analytics-event.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { Payment } from '../payment/domain/entities/payment.entity';
import { LedgerEntry } from '../payment/domain/entities/ledger-entry.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { AnalyticsService } from './application/analytics.service';
import { AnalyticsController } from './api/analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent, Appointment, Payment, LedgerEntry, Doctor]),
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
