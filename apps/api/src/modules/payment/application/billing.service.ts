import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../domain/entities/invoice.entity';
import { LedgerEntry } from '../domain/entities/ledger-entry.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
  ) {}

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return this.invoices.find({ where: { tenantId }, order: { periodStart: 'DESC' } });
  }

  async listLedger(tenantId: string): Promise<LedgerEntry[]> {
    return this.ledger.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 200 });
  }
}
