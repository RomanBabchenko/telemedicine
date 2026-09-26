import { AppointmentStatus } from '@telemed/shared-types';
import { StaleConsultationSweeper } from '../stale-consultation.sweeper';
import { JOIN_CLOSES_AFTER_END_MS } from '../consultation.service';

const NOW = new Date('2026-09-26T12:00:00Z');

function build(opts?: {
  lock?: boolean;
  rows?: Array<{ session_id: string; tenant_id: string }>;
  autoEnd?: jest.Mock;
}) {
  const dataSource = { query: jest.fn(async () => opts?.rows ?? []) };
  const redis = { setNxEx: jest.fn(async () => opts?.lock ?? true) };
  const seenTenants: string[] = [];
  let current: string | null = null;
  const tenantContext = {
    run: jest.fn((ctx: { tenantId: string }, fn: () => unknown) => {
      current = ctx.tenantId;
      return fn();
    }),
  };
  const autoEnd =
    opts?.autoEnd ??
    jest.fn(async () => {
      seenTenants.push(current!);
      return 'ended';
    });
  const consultations = { autoEndIfAbandoned: autoEnd };
  const sweeper = new StaleConsultationSweeper(
    dataSource as never,
    redis as never,
    tenantContext as never,
    consultations as never,
  );
  return { sweeper, dataSource, redis, autoEnd, seenTenants };
}

describe('StaleConsultationSweeper', () => {
  it('does nothing when another instance holds the lock', async () => {
    const { sweeper, dataSource } = build({ lock: false });
    await sweeper.sweep(NOW);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('selects IN_PROGRESS appointments whose join window has closed', async () => {
    const { sweeper, dataSource } = build();
    await sweeper.sweep(NOW);
    const [, params] = dataSource.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[0]).toBe(AppointmentStatus.IN_PROGRESS);
    expect(params[1]).toEqual(new Date(NOW.getTime() - JOIN_CLOSES_AFTER_END_MS));
  });

  it('runs each session inside its own tenant context', async () => {
    const { sweeper, autoEnd, seenTenants } = build({
      rows: [
        { session_id: 's-1', tenant_id: 't-1' },
        { session_id: 's-2', tenant_id: 't-2' },
      ],
    });
    await sweeper.sweep(NOW);
    expect(autoEnd).toHaveBeenCalledWith('s-1', NOW);
    expect(autoEnd).toHaveBeenCalledWith('s-2', NOW);
    expect(seenTenants).toEqual(['t-1', 't-2']);
  });

  it('one failing session does not stop the batch', async () => {
    const autoEnd = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ended');
    const { sweeper } = build({
      rows: [
        { session_id: 's-1', tenant_id: 't-1' },
        { session_id: 's-2', tenant_id: 't-1' },
      ],
      autoEnd,
    });
    await expect(sweeper.sweep(NOW)).resolves.toBeUndefined();
    expect(autoEnd).toHaveBeenCalledTimes(2);
  });
});
