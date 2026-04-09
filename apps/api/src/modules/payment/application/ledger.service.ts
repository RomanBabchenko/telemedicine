import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { LedgerAccount } from '@telemed/shared-types';
import { LedgerEntry } from '../domain/entities/ledger-entry.entity';
import { RevenueShareRule } from '../../tenant/domain/entities/revenue-share-rule.entity';

export interface LedgerBookingInput {
  tenantId: string;
  paymentId: string;
  appointmentId: string;
  totalAmount: number;
  currency: string;
}

interface BookedLedger {
  platform: number;
  clinic: number;
  doctor: number;
  acquirerFee: number;
  tax: number;
  misPartner: number;
}

const ACQUIRER_FEE_PCT = 2.7;
const TAX_PCT = 0;

/**
 * Ledger-based accounting. Every payment.succeeded creates a balanced set of
 * debit/credit rows so we can produce reports across PLATFORM_REVENUE,
 * CLINIC_REVENUE, DOCTOR_PAYABLE, ACQUIRER_FEE, TAX, MIS_PARTNER_SHARE.
 *
 * Math:
 *   gross           = total amount the patient was charged
 *   acquirer fee    = gross * 2.7%
 *   tax             = gross * 0%
 *   net to split    = gross − acquirer − tax
 *   shares (pct from RevenueShareRule, default 15/25/60/0)
 */
@Injectable()
export class LedgerService {
  async bookPaymentSucceeded(
    em: EntityManager,
    input: LedgerBookingInput,
  ): Promise<BookedLedger> {
    const { tenantId, paymentId, appointmentId, totalAmount } = input;
    const repo = em.getRepository(LedgerEntry);

    const rule =
      (await em.getRepository(RevenueShareRule).findOne({
        where: { tenantId },
      })) ??
      ({
        platformPct: '15',
        clinicPct: '25',
        doctorPct: '60',
        misPartnerPct: '0',
      } as RevenueShareRule);

    const acquirerFee = round2((totalAmount * ACQUIRER_FEE_PCT) / 100);
    const tax = round2((totalAmount * TAX_PCT) / 100);
    const net = round2(totalAmount - acquirerFee - tax);

    const platformPct = Number(rule.platformPct);
    const clinicPct = Number(rule.clinicPct);
    const doctorPct = Number(rule.doctorPct);
    const misPartnerPct = Number(rule.misPartnerPct);
    const totalPct = platformPct + clinicPct + doctorPct + misPartnerPct || 100;

    const platform = round2((net * platformPct) / totalPct);
    const clinic = round2((net * clinicPct) / totalPct);
    const misPartner = round2((net * misPartnerPct) / totalPct);
    const doctor = round2(net - platform - clinic - misPartner);

    const make = (account: LedgerAccount, debit: number, credit: number, memo: string) =>
      repo.create({
        tenantId,
        paymentId,
        appointmentId,
        account,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        memo,
      });

    const rows = [
      make(LedgerAccount.PATIENT_PAYABLE, totalAmount, 0, 'patient charge'),
      make(LedgerAccount.ACQUIRER_FEE, 0, acquirerFee, 'acquirer fee'),
      make(LedgerAccount.TAX, 0, tax, 'tax'),
      make(LedgerAccount.PLATFORM_REVENUE, 0, platform, 'platform share'),
      make(LedgerAccount.CLINIC_REVENUE, 0, clinic, 'clinic share'),
      make(LedgerAccount.DOCTOR_PAYABLE, 0, doctor, 'doctor share'),
    ];
    if (misPartner > 0) {
      rows.push(make(LedgerAccount.MIS_PARTNER_SHARE, 0, misPartner, 'MIS partner share'));
    }

    await repo.save(rows);
    return { platform, clinic, doctor, acquirerFee, tax, misPartner };
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
