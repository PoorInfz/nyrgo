import { describe, expect, it } from 'vitest';
import { ageFrom, checkAge, minAgeFor } from '../src/index.js';

const now = new Date('2026-10-29T12:00:00Z');

describe('ageFrom', () => {
  it('counts completed years and never overstates age within the birth month', () => {
    expect(ageFrom(2008, 9, now)).toBe(18); // birthday already passed
    expect(ageFrom(2008, 10, now)).toBe(17); // birth month: assume end of month
    expect(ageFrom(2008, 11, now)).toBe(17);
  });
});

describe('minAgeFor', () => {
  it('uses 14 for Spain and 16 elsewhere', () => {
    expect(minAgeFor('ES')).toBe(14);
    expect(minAgeFor('es')).toBe(14);
    expect(minAgeFor('FR')).toBe(16);
    expect(minAgeFor(null)).toBe(16);
  });
});

describe('checkAge', () => {
  it('assigns bands', () => {
    expect(checkAge(1990, 1, 'ES', now)).toEqual({ ok: true, band: '18+' });
    expect(checkAge(2009, 1, 'ES', now)).toEqual({ ok: true, band: '16-17' });
    expect(checkAge(2012, 1, 'ES', now)).toEqual({ ok: true, band: '13-15' });
  });

  it('refuses players under the regional minimum', () => {
    expect(checkAge(2013, 1, 'ES', now)).toEqual({ ok: false, minAge: 14 }); // 13
    expect(checkAge(2011, 1, 'FR', now)).toEqual({ ok: false, minAge: 16 }); // 15
  });

  it('refuses impossible ages', () => {
    expect(checkAge(1890, 1, 'ES', now).ok).toBe(false);
    expect(checkAge(2030, 1, 'ES', now).ok).toBe(false);
  });
});
