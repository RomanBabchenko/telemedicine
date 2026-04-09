import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentStatus, LedgerAccount, PaymentStatus } from '@telemed/shared-types';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { Payment } from '../../payment/domain/entities/payment.entity';
import { LedgerEntry } from '../../payment/domain/entities/ledger-entry.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
  ) {}

  async doctorStats(doctorId: string) {
    const all = await this.appointments.find({ where: { doctorId } });
    const completedSet: AppointmentStatus[] = [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.DOCUMENTATION_COMPLETED,
    ];
    const cancelledSet: AppointmentStatus[] = [
      AppointmentStatus.CANCELLED_BY_PATIENT,
      AppointmentStatus.CANCELLED_BY_PROVIDER,
    ];
    const noShowSet: AppointmentStatus[] = [
      AppointmentStatus.NO_SHOW_PATIENT,
      AppointmentStatus.NO_SHOW_PROVIDER,
    ];
    const consultations = all.filter((a) => completedSet.includes(a.status)).length;
    const cancellations = all.filter((a) => cancelledSet.includes(a.status)).length;
    const noShows = all.filter((a) => noShowSet.includes(a.status)).length;

    const payouts = await this.ledger
      .createQueryBuilder('e')
      .select('SUM(e.credit)', 'total')
      .where('e.account = :acc', { acc: LedgerAccount.DOCTOR_PAYABLE })
      .getRawOne<{ total: string | null }>();

    return {
      doctorId,
      consultations,
      cancellations,
      noShows,
      averagePrice: 0,
      totalRevenue: Number(payouts?.total ?? 0),
      followUpCount: 0,
      averageDurationMin: 30,
      rating: null,
    };
  }

  async tenantStats(tenantId: string) {
    const all = await this.appointments.find({ where: { tenantId } });
    const total = all.length;
    const completedSet: AppointmentStatus[] = [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.DOCUMENTATION_COMPLETED,
    ];
    const cancelledSet: AppointmentStatus[] = [
      AppointmentStatus.CANCELLED_BY_PATIENT,
      AppointmentStatus.CANCELLED_BY_PROVIDER,
    ];
    const completed = all.filter((a) => completedSet.includes(a.status)).length;
    const cancellations = all.filter((a) => cancelledSet.includes(a.status)).length;

    const revenueRow = await this.ledger
      .createQueryBuilder('e')
      .select('SUM(e.credit)', 'total')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.account = :acc', { acc: LedgerAccount.CLINIC_REVENUE })
      .getRawOne<{ total: string | null }>();

    const succeeded = await this.payments.count({
      where: { tenantId, status: PaymentStatus.SUCCEEDED },
    });

    return {
      tenantId,
      onlineRevenue: Number(revenueRow?.total ?? 0),
      utilizationPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      bookingToPaymentConversion: total > 0 ? Math.round((succeeded / total) * 100) : 0,
      paymentToShownConversion:
        succeeded > 0 ? Math.round((completed / succeeded) * 100) : 0,
      cancellationsByReason: { total: cancellations },
      patientRetentionPct: 0,
      bySpecialization: {} as Record<string, number>,
    };
  }

  async platformOverview() {
    const gmvRow = await this.ledger
      .createQueryBuilder('e')
      .select('SUM(e.debit)', 'gmv')
      .where('e.account = :acc', { acc: LedgerAccount.PATIENT_PAYABLE })
      .getRawOne<{ gmv: string | null }>();
    const platformRow = await this.ledger
      .createQueryBuilder('e')
      .select('SUM(e.credit)', 'rev')
      .where('e.account = :acc', { acc: LedgerAccount.PLATFORM_REVENUE })
      .getRawOne<{ rev: string | null }>();
    const refunded = await this.payments.count({
      where: { status: PaymentStatus.REFUNDED },
    });
    const totalPayments = await this.payments.count();

    const gmv = Number(gmvRow?.gmv ?? 0);
    const platform = Number(platformRow?.rev ?? 0);
    return {
      gmv,
      takeRate: gmv > 0 ? Number(((platform / gmv) * 100).toFixed(2)) : 0,
      netRevenue: platform,
      refundRate: totalPayments > 0 ? Number(((refunded / totalPayments) * 100).toFixed(2)) : 0,
      doctorActivation: 0,
      averageRevenuePerTenant: 0,
      averageRevenuePerDoctor: 0,
    };
  }
}
