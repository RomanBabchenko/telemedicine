import { LedgerService } from '../application/ledger.service';

describe('LedgerService.bookPaymentSucceeded', () => {
  let service: LedgerService;
  let savedRows: Array<{ account: string; debit: string; credit: string }>;
  let mockEm: { getRepository: jest.Mock };

  beforeEach(() => {
    service = new LedgerService();
    savedRows = [];
    mockEm = {
      getRepository: jest.fn((entity: { name: string } | Function) => {
        const name = typeof entity === 'function' ? entity.name : entity.name;
        if (name === 'LedgerEntry') {
          return {
            create: (data: { account: string; debit: string; credit: string }) => data,
            save: (rows: typeof savedRows) => {
              savedRows.push(...rows);
              return Promise.resolve(rows);
            },
          };
        }
        if (name === 'RevenueShareRule') {
          return {
            findOne: () => Promise.resolve(null),
          };
        }
        return {};
      }),
    };
  });

  it('produces a balanced ledger for a 1000 UAH payment with default split', async () => {
    const result = await service.bookPaymentSucceeded(mockEm as never, {
      tenantId: 'tenant-1',
      paymentId: 'p-1',
      appointmentId: 'a-1',
      totalAmount: 1000,
      currency: 'UAH',
    });

    // Acquirer: 2.7% of 1000 = 27.00
    expect(result.acquirerFee).toBeCloseTo(27.0, 2);
    expect(result.tax).toBe(0);
    // Net = 973
    const net = 1000 - 27 - 0;
    // Default split 15/25/60/0 of 973
    const expectedPlatform = +((net * 15) / 100).toFixed(2);
    const expectedClinic = +((net * 25) / 100).toFixed(2);
    const expectedDoctor = +(net - expectedPlatform - expectedClinic).toFixed(2);
    expect(result.platform).toBeCloseTo(expectedPlatform, 2);
    expect(result.clinic).toBeCloseTo(expectedClinic, 2);
    expect(result.doctor).toBeCloseTo(expectedDoctor, 2);
    expect(result.misPartner).toBe(0);
  });

  it('persists 6 rows by default (no MIS partner)', async () => {
    await service.bookPaymentSucceeded(mockEm as never, {
      tenantId: 'tenant-1',
      paymentId: 'p-1',
      appointmentId: 'a-1',
      totalAmount: 500,
      currency: 'UAH',
    });
    expect(savedRows).toHaveLength(6);
    const accounts = savedRows.map((r) => r.account);
    expect(accounts).toContain('PATIENT_PAYABLE');
    expect(accounts).toContain('ACQUIRER_FEE');
    expect(accounts).toContain('TAX');
    expect(accounts).toContain('PLATFORM_REVENUE');
    expect(accounts).toContain('CLINIC_REVENUE');
    expect(accounts).toContain('DOCTOR_PAYABLE');
  });
});
