import { SlotHoldService } from '../application/slot-hold.service';

class FakeRedis {
  store = new Map<string, string>();
  async setNxEx(key: string, value: string): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    return true;
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
}

describe('SlotHoldService', () => {
  let svc: SlotHoldService;
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    svc = new SlotHoldService(redis as never);
  });

  it('first reservation wins, second loses (race condition guard)', async () => {
    const won1 = await svc.tryHold('slot-1', 'patient-A');
    const won2 = await svc.tryHold('slot-1', 'patient-B');
    expect(won1).toBe(true);
    expect(won2).toBe(false);
    expect(await svc.getHolder('slot-1')).toBe('patient-A');
  });

  it('release allows another reservation to take the slot', async () => {
    await svc.tryHold('slot-2', 'patient-A');
    await svc.release('slot-2');
    const won = await svc.tryHold('slot-2', 'patient-B');
    expect(won).toBe(true);
  });
});
