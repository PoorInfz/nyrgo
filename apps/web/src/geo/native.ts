import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LocationError, LocationFix, LocationSource } from './location';

/** The Android app's native guard (apps/mobile, GuardPlugin.java). */
interface NativeFix {
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number | null;
  timestamp: number;
  mock: boolean;
}
interface GuardPlugin {
  watchPosition(
    options: Record<string, never>,
    callback: (fix: NativeFix | null, err?: { code?: string }) => void,
  ): Promise<string>;
  clearWatch(options: { id: string }): Promise<void>;
  integrityToken(options: {
    nonce: string;
    cloudProjectNumber?: string;
  }): Promise<{ token: string }>;
}

export const Guard = registerPlugin<GuardPlugin>('Guard');

/** True inside the Android app (Capacitor), false in a browser. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

const ERRORS: Record<string, LocationError> = {
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  UNSUPPORTED: 'unsupported',
};

/**
 * GPS through Android's own location service, so each fix carries whether Android marked it as
 * mocked (a spoofing app). The server pauses play and records it when it is.
 */
export function nativeSource(guard: GuardPlugin = Guard): LocationSource {
  return {
    kind: 'gps',
    start(onFix, onError) {
      let id: string | null = null;
      let stopped = false;
      guard
        .watchPosition({}, (fix, err) => {
          if (err || !fix) {
            onError(ERRORS[err?.code ?? ''] ?? 'unavailable');
            return;
          }
          const out: LocationFix = {
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
            speed: fix.speed ?? null,
            timestamp: fix.timestamp,
            mock: fix.mock,
          };
          onFix(out);
        })
        .then((callbackId) => {
          id = callbackId;
          if (stopped) void guard.clearWatch({ id });
        })
        .catch(() => onError('unavailable'));
      return () => {
        stopped = true;
        if (id) void guard.clearWatch({ id });
      };
    },
  };
}
