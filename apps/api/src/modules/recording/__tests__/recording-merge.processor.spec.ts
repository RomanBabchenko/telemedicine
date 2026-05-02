import {
  buildAmixFilter,
  computeInputDelaysMs,
} from '../application/recording-merge.processor';

describe('computeInputDelaysMs', () => {
  it('returns 0 for every input when all started at the same time', () => {
    const t = new Date('2026-05-02T10:00:00.000Z');
    const delays = computeInputDelaysMs([{ startedAt: t }, { startedAt: t }]);
    expect(delays).toEqual([0, 0]);
  });

  it('places later inputs at the correct offset relative to the earliest', () => {
    const base = new Date('2026-05-02T10:00:00.000Z').getTime();
    const delays = computeInputDelaysMs([
      { startedAt: new Date(base) },
      { startedAt: new Date(base + 12_000) }, // patient joined 12s later
      { startedAt: new Date(base + 600_000) }, // patient reconnected at t=10min
    ]);
    expect(delays).toEqual([0, 12_000, 600_000]);
  });

  it('treats null startedAt as t=0', () => {
    const t = new Date('2026-05-02T10:00:00.000Z');
    const delays = computeInputDelaysMs([{ startedAt: null }, { startedAt: t }]);
    // earliest = 0; second input is t.getTime() ms later
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBe(t.getTime());
  });

  it('returns [] for empty input', () => {
    expect(computeInputDelaysMs([])).toEqual([]);
  });
});

describe('buildAmixFilter', () => {
  it('builds a single-input passthrough graph', () => {
    const f = buildAmixFilter(1, [0]);
    expect(f).toBe(
      '[0:a]adelay=0:all=1[a0];[a0]amix=inputs=1:duration=longest:dropout_transition=0',
    );
  });

  it('builds a two-input graph with no offsets (all started together)', () => {
    const f = buildAmixFilter(2, [0, 0]);
    expect(f).toBe(
      '[0:a]adelay=0:all=1[a0];[1:a]adelay=0:all=1[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0',
    );
  });

  it('places a reconnect at the right offset (the bug from per-track approach)', () => {
    // Patient was originally egress idx=1 (joined together with doctor),
    // disconnected at ~10min and a NEW egress idx=2 started at +12min.
    // Without delays, idx=2 would overlap idx=1 from t=0 — wrong. The
    // adelay=720000 places it at the actual reconnect timestamp.
    const f = buildAmixFilter(3, [0, 0, 720_000]);
    expect(f).toContain('[2:a]adelay=720000:all=1[a2]');
    expect(f).toContain('amix=inputs=3:duration=longest:dropout_transition=0');
  });

  it('scales to >2 participants (group consultation)', () => {
    const f = buildAmixFilter(5, [0, 1000, 2000, 3000, 4000]);
    expect(f).toContain('amix=inputs=5');
    // every input is wrapped in adelay
    for (let i = 0; i < 5; i++) {
      expect(f).toContain(`[${i}:a]adelay=${i * 1000}:all=1[a${i}]`);
    }
  });

  it('treats missing delay entries as 0 (defensive)', () => {
    const f = buildAmixFilter(2, [0]); // delaysMs shorter than inputCount
    expect(f).toContain('[1:a]adelay=0:all=1[a1]');
  });
});
