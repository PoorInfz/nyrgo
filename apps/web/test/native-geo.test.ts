import { describe, expect, it, vi } from 'vitest';
import { nativeSource } from '../src/geo/native';
import type { LocationFix } from '../src/geo/location';

describe('native location (Android app)', () => {
  it('passes fixes on with the mocked flag, and stops the watch', async () => {
    let cb: ((fix: unknown, err?: { code?: string }) => void) | null = null;
    const guard = {
      watchPosition: vi.fn(async (_o: object, c: typeof cb) => {
        cb = c;
        return 'w1';
      }),
      clearWatch: vi.fn(async () => undefined),
      integrityToken: vi.fn(),
    };
    const fixes: LocationFix[] = [];
    const errors: string[] = [];
    const stop = nativeSource(guard as unknown as Parameters<typeof nativeSource>[0]).start(
      (f) => fixes.push(f),
      (e) => errors.push(e),
    );
    await Promise.resolve();
    cb!({ lat: 37.88, lng: -4.77, accuracy: 6, speed: 1.2, timestamp: 5, mock: true });
    cb!(null, { code: 'DENIED' });
    expect(fixes).toEqual([
      { lat: 37.88, lng: -4.77, accuracy: 6, speed: 1.2, timestamp: 5, mock: true },
    ]);
    expect(errors).toEqual(['denied']);
    stop();
    expect(guard.clearWatch).toHaveBeenCalledWith({ id: 'w1' });
  });
});
