import { generateInviteCode } from '../short-code.util';

describe('generateInviteCode', () => {
  it('produces 12 base62 characters by default', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateInviteCode()).toMatch(/^[A-Za-z0-9]{12}$/);
    }
  });

  it('respects a custom length', () => {
    expect(generateInviteCode(8)).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(generateInviteCode(20)).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('does not collide over a 10k sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateInviteCode());
    expect(seen.size).toBe(10_000);
  });

  it('uses the full alphabet (no dead character ranges)', () => {
    // 2000 codes × 12 chars ≈ 387 expected hits per character — a missing
    // character would indicate a broken rejection-sampling threshold.
    const chars = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      for (const ch of generateInviteCode()) chars.add(ch);
    }
    expect(chars.size).toBe(62);
  });
});
