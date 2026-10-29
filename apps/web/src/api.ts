import type { AgeBand, ErrorCode } from '@nyrgo/shared';
import type { LocationFix } from './geo/location';
import type { MapPoi } from './map/style';

export interface Profile {
  id: string;
  kind: 'guest' | 'registered';
  email: string | null;
  ageBand: AgeBand;
  region: string | null;
  displayName: string;
  level: number;
  xp: number;
  gold: number;
  canUseWeb3: boolean;
  createdAt: string;
}

export interface Movement {
  speedKmh: number | null;
  interactable: boolean;
  reason: 'speed' | 'teleport_cooldown' | null;
  lockedUntil: string | null;
}

export interface Nearby {
  cell: string;
  movement: Movement;
  visibleRadiusM: number;
  interactionRadiusM: number;
  attribution: string;
  pois: MapPoi[];
}

export type PoiReportReason = 'unsafe' | 'private' | 'inaccessible' | 'other';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
  ) {
    super(message);
  }
}

export function createApi(baseUrl: string) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network', 'Network error');
    }
    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const p = (data ?? {}) as { code?: ErrorCode; title?: string };
      throw new ApiError(res.status, p.code ?? 'internal_error', p.title ?? res.statusText);
    }
    return data as T;
  }

  return {
    me: () => call<Profile>('GET', '/v1/me'),
    createGuest: (birthYear: number, birthMonth: number) =>
      call<Profile>('POST', '/v1/auth/guest', { birthYear, birthMonth }),
    requestLink: (email: string) => call<{ sent: true }>('POST', '/v1/auth/magic-link', { email }),
    verify: (token: string) => call<Profile>('POST', '/v1/auth/verify', { token }),
    logout: () => call<void>('POST', '/v1/auth/logout'),
    rename: (displayName: string) => call<Profile>('PATCH', '/v1/me', { displayName }),
    exportData: () => call<unknown>('GET', '/v1/me/data-export'),
    deleteAccount: () => call<void>('DELETE', '/v1/me', { confirm: 'DELETE' }),
    nearby: (fix: LocationFix) =>
      call<Nearby>('POST', '/v1/world/nearby', {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        speed: fix.speed,
        timestamp: Math.round(fix.timestamp),
      }),
    reportPoi: (id: string, reason: PoiReportReason) =>
      call<{ received: true }>('POST', `/v1/pois/${encodeURIComponent(id)}/report`, { reason }),
  };
}

export type Api = ReturnType<typeof createApi>;
