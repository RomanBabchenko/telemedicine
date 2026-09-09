import { AuditQueryService } from '../application/audit-query.service';

// Records the SQL fragments handed to the query builder so we can assert on
// the shape of the WHERE clause without a database.
const build = () => {
  const calls: Array<{ kind: 'where' | 'andWhere'; sql: string; params?: unknown }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    where: jest.fn((sql: string, params?: unknown) => {
      calls.push({ kind: 'where', sql, params });
      return qb;
    }),
    andWhere: jest.fn((sql: string, params?: unknown) => {
      calls.push({ kind: 'andWhere', sql, params });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  const events = { createQueryBuilder: jest.fn(() => qb) };
  const svc = new AuditQueryService(events as never, { getTenantId: () => 't-1' } as never);
  return { svc, calls };
};

describe('AuditQueryService.list', () => {
  it('parenthesises the tenant OR so later filters apply to both branches', async () => {
    const { svc, calls } = build();
    await svc.list({ action: 'auth.login' });
    const base = calls.find((c) => c.kind === 'where')!;
    // Without the brackets `A OR B AND C` binds as `A OR (B AND C)` — the
    // bug that made every filter a no-op for tenant-scoped rows.
    expect(base.sql).toBe('(e.tenant_id = :tenantId OR e.tenant_id IS NULL)');
  });

  it('matches action as a case-insensitive prefix and escapes LIKE metacharacters', async () => {
    const { svc, calls } = build();
    await svc.list({ action: 'auth_%' });
    const action = calls.find((c) => c.sql.includes('e.action'))!;
    expect(action.sql).toBe('e.action ILIKE :action');
    expect(action.params).toEqual({ action: 'auth\\_\\%%' });
  });

  it('matches resourceType case-insensitively', async () => {
    const { svc, calls } = build();
    await svc.list({ resourceType: 'user' });
    expect(calls.find((c) => c.sql.includes('e.resource_type'))!.sql).toBe(
      'e.resource_type ILIKE :rt',
    );
  });

  it('applies from/to bounds to created_at', async () => {
    const { svc, calls } = build();
    await svc.list({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z' });
    expect(calls.map((c) => c.sql)).toEqual(
      expect.arrayContaining(['e.created_at >= :from', 'e.created_at <= :to']),
    );
  });

  it('adds no filter clauses when none are given', async () => {
    const { svc, calls } = build();
    await svc.list({});
    expect(calls.filter((c) => c.kind === 'andWhere')).toHaveLength(0);
  });
});
