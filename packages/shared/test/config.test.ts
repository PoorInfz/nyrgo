import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, RARITIES, captureChance, canUseWeb3, problem } from '../src/index.js';

describe('DEFAULT_CONFIG', () => {
  it('defines a base capture chance and XP multiplier for every rarity', () => {
    for (const r of RARITIES) {
      expect(DEFAULT_CONFIG.capture.baseChance[r]).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.economy.rarityXpMultiplier[r]).toBeGreaterThanOrEqual(1);
    }
  });

  it('makes rarer creatures strictly harder to capture', () => {
    const chances = RARITIES.map((r) => DEFAULT_CONFIG.capture.baseChance[r]);
    for (let i = 1; i < chances.length; i++) {
      expect(chances.at(i)!).toBeLessThan(chances.at(i - 1)!);
    }
  });

  it('keeps capped daily faucets within the daily gameplay gold cap', () => {
    const r = DEFAULT_CONFIG.economy.rewards;
    const cappedGold =
      r.pveWin.gold * r.pveWin.dailyCap +
      r.dailyMission.gold * r.dailyMission.perDay +
      r.newCell.gold * r.newCell.dailyCap;
    expect(cappedGold).toBeLessThanOrEqual(DEFAULT_CONFIG.economy.dailyGameplayGoldCap);
  });
});

describe('captureChance', () => {
  const cfg = DEFAULT_CONFIG.capture;

  it('clamps to the configured floor and ceiling', () => {
    expect(captureChance(cfg, 'mythic', 1, 0.01, 0)).toBe(cfg.minChance);
    expect(captureChance(cfg, 'common', 2, 1, 1)).toBe(cfg.maxChance);
  });

  it('rewards throw skill and ignores out-of-range scores', () => {
    const none = captureChance(cfg, 'rare', 1, 1, 0);
    const full = captureChance(cfg, 'rare', 1, 1, 1);
    expect(full).toBeCloseTo(none * 1.25);
    expect(captureChance(cfg, 'rare', 1, 1, 5)).toBe(full);
    expect(captureChance(cfg, 'rare', 1, 1, -3)).toBe(none);
  });
});

describe('age gating', () => {
  it('only allows web3 features for adults', () => {
    expect(canUseWeb3('18+')).toBe(true);
    expect(canUseWeb3('16-17')).toBe(false);
    expect(canUseWeb3('13-15')).toBe(false);
  });
});

describe('problem', () => {
  it('maps codes to HTTP statuses', () => {
    expect(problem('too_far', 'Too far').status).toBe(422);
    expect(problem('spawn_expired', 'Gone', 'x')).toMatchObject({ status: 410, detail: 'x' });
  });
});
