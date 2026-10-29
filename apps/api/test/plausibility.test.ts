import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { assess, haversineM, type Fix } from '../src/modules/anticheat/plausibility.js';

const ac = DEFAULT_CONFIG.antiCheat;
const world = DEFAULT_CONFIG.world;
const T0 = Date.parse('2026-10-29T10:00:00Z');

const tendillas: Fix = { lat: 37.8847, lng: -4.7792, accuracy: 5, at: T0 };
/** A point `m` metres north of Las Tendillas. */
const north = (m: number) => ({ lat: tendillas.lat + m / 111_195, lng: tendillas.lng });
const at = (s: number) => T0 + s * 1000;

const run = (prev: Fix | null, cur: Fix & { clientTs?: number }, accs: number[] = []) =>
  assess(prev, cur, accs, ac, world);

describe('assess', () => {
  it('accepts the first fix with nothing to compare', () => {
    expect(run(null, tendillas)).toMatchObject({ verdict: 'ok', speedKmh: null, signals: [] });
  });

  it('accepts walking', () => {
    // 70 m in 60 s ≈ 4.2 km/h (minus 10 m of accuracy ≈ 3.6 km/h)
    const r = run(tendillas, { ...north(70), accuracy: 5, at: at(60) });
    expect(r.verdict).toBe('ok');
    expect(r.speedKmh!).toBeGreaterThan(3);
    expect(r.speedKmh!).toBeLessThan(5);
  });

  it('does not count GPS drift inside the accuracy circles as movement', () => {
    const r = run({ ...tendillas, accuracy: 30 }, { ...north(50), accuracy: 30, at: at(3) });
    expect(r.certainM).toBe(0);
    expect(r.verdict).toBe('ok');
  });

  it('pauses interactions at vehicle speed without any signal', () => {
    // 500 m in 36 s = 50 km/h
    const r = run(tendillas, { ...north(510), accuracy: 5, at: at(36) });
    expect(r.verdict).toBe('too_fast');
    expect(r.signals).toEqual([]);
  });

  it('flags a jump of several kilometres in seconds as a teleport', () => {
    const r = run(tendillas, { ...north(5_000), accuracy: 5, at: at(30) });
    expect(r.verdict).toBe('teleport');
    expect(r.signals.map((s) => s.kind)).toEqual(['teleport']);
  });

  it('weighs faster-than-airliner jumps more', () => {
    const madrid = { lat: 40.4168, lng: -3.7038, accuracy: 5, at: at(60) };
    const r = run(tendillas, madrid);
    expect(r.verdict).toBe('teleport');
    expect(r.signals).toEqual([expect.objectContaining({ kind: 'impossible_speed', score: 30 })]);
  });

  it('treats a high-speed train as travel, not an impossible jump', () => {
    // ~300 km/h for 10 minutes ≈ 50 km
    const r = run(tendillas, { ...north(50_000), accuracy: 10, at: at(600) });
    expect(r.speedKmh!).toBeGreaterThan(290);
    expect(r.signals.map((s) => s.kind)).toEqual(['teleport']);
  });

  it('ignores short glitches and huge gaps in time', () => {
    expect(run(tendillas, { ...north(300), accuracy: 5, at: at(1) }).verdict).toBe('ok');
    // yesterday in Madrid, today in Córdoba
    const yesterday = { lat: 40.4168, lng: -3.7038, accuracy: 5, at: at(-86_400) };
    expect(run(yesterday, tendillas).verdict).toBe('ok');
  });

  it('flags clock skew beyond two minutes', () => {
    const r = run(null, { ...tendillas, clientTs: T0 - 10 * 60_000 });
    expect(r.signals).toEqual([{ kind: 'clock_skew', score: 3, detail: { skewS: 600 } }]);
    expect(run(null, { ...tendillas, clientTs: T0 - 30_000 }).signals).toEqual([]);
  });

  it('flags a long run of identical, very precise accuracy values', () => {
    const same = Array<number>(19).fill(5);
    expect(run(null, tendillas, same).signals.map((s) => s.kind)).toEqual(['constant_accuracy']);
    expect(run(null, tendillas, [...same.slice(1), 6]).signals).toEqual([]);
    expect(run(null, { ...tendillas, accuracy: 25 }, Array(19).fill(25)).signals).toEqual([]);
  });
});

describe('haversineM', () => {
  it('matches the known Córdoba–Madrid distance (~300 km)', () => {
    const d = haversineM(tendillas, { lat: 40.4168, lng: -3.7038 });
    expect(d / 1000).toBeGreaterThan(290);
    expect(d / 1000).toBeLessThan(310);
  });
});
