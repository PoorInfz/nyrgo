import { describe, expect, it } from 'vitest';
import { HOLDER_TIERS, TOKEN, TOKEN_UNIT } from '@nyrgo/shared';
import { rankFrom } from '../src/modules/holder/ranks.js';

const H = 3_600_000;
const tokens = (n: number) => BigInt(n) * TOKEN_UNIT;
const tier = (id: string) => HOLDER_TIERS.find((t) => t.id === id)!;

describe('holder rank from balances', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  /** One snapshot an hour for `hours` hours up to now, with the balance given by `f(hoursAgo)`. */
  const hourly = (hours: number, f: (ago: number) => number) =>
    Array.from({ length: hours + 1 }, (_, i) => hours - i).map((ago) => ({
      at: new Date(now.getTime() - ago * H),
      balance: tokens(f(ago)),
    }));

  it('needs the whole window watched before a rank counts', () => {
    const r = rankFrom(
      hourly(12, () => 5_000_000),
      now,
    );
    expect(r.tier).toBeNull();
    expect(r.next?.tier.id).toBe('h3');
    // it counts a full window after the first snapshot
    expect(r.next!.countsAt.getTime()).toBe(now.getTime() - 12 * H + TOKEN.holdHours * H);
  });

  it('counts the smallest balance of the window', () => {
    const r = rankFrom(
      hourly(48, (ago) => (ago === 10 ? 1_500_000 : 20_000_000)),
      now,
    );
    expect(r.tier).toBe(tier('h1'));
    expect(r.balance).toBe(tokens(20_000_000));
    // the top rank counts a full window after the dip
    expect(r.next?.tier.id).toBe('h5');
    expect(r.next!.countsAt.getTime()).toBe(now.getTime() - 9 * H + TOKEN.holdHours * H);
  });

  it('gives each rank at its amount and nothing below the first', () => {
    for (const t of HOLDER_TIERS) {
      expect(
        rankFrom(
          hourly(24 * 7, () => t.amount),
          now,
        ).tier,
      ).toBe(t);
      expect(
        rankFrom(
          hourly(24 * 7, () => t.amount - 1),
          now,
        ).tier,
      ).not.toBe(t);
    }
    expect(
      rankFrom(
        hourly(24 * 7, () => 999_999),
        now,
      ),
    ).toMatchObject({ tier: null, next: null });
  });

  it('grants nothing on stale balances', () => {
    const old = hourly(48, () => 20_000_000).slice(0, -12);
    expect(rankFrom(old, now)).toMatchObject({ tier: null, stale: true });
  });
});
