import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUB_MAPS, canStand } from '@nyrgo/shared';
import { Town, newBody, WALK_TILES } from '../src/hub/engine';
import { connectHub, hubSocketUrl } from '../src/hub/net';

const plaza = HUB_MAPS.plaza!;

describe('the town client', () => {
  afterEach(() => vi.useRealTimers());

  it('builds the socket address from the API address', () => {
    expect(hubSocketUrl('https://api.nyrgo.fun')).toBe('wss://api.nyrgo.fun/v1/hub/ws');
    expect(hubSocketUrl('http://localhost:3000')).toBe('ws://localhost:3000/v1/hub/ws');
  });

  it('walks at walking speed and never into walls', () => {
    const town = new Town(plaza);
    town.meId = 'me';
    town.bodies.set(
      'me',
      newBody({
        id: 'me',
        name: 'me',
        level: 1,
        look: {} as never,
        companion: null,
        ...plaza.spawn,
      }),
    );
    town.input = { x: 1, y: 0 };
    const x0 = town.me()!.x;
    town.update(0.5, 0);
    expect(town.me()!.x - x0).toBeCloseTo(WALK_TILES * 32 * 0.5, 0);
    // walk north for a long time: always on walkable ground
    town.input = { x: 0, y: -1 };
    for (let i = 0; i < 400; i++) {
      town.update(0.05, i * 50);
      expect(canStand(plaza, town.me()!.x, town.me()!.y)).toBe(true);
    }
  });

  it('sends at most ten positions a second, and reconnects after a drop', () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      readyState = 0;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onclose: ((e: { code: number }) => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      send(d: string) {
        this.sent.push(d);
      }
      close() {
        this.readyState = 3;
      }
    }
    const statuses: string[] = [];
    const c = connectHub('ws://x', { event: () => {}, status: (s) => statuses.push(s) }, () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    });
    sockets[0]!.readyState = 1;
    sockets[0]!.onopen!();
    for (let i = 0; i < 50; i++) c.move(100 + i, 200, 'r', true);
    vi.advanceTimersByTime(1000);
    const moves = sockets[0]!.sent.filter((d) => d.includes('"move"'));
    expect(moves.length).toBeLessThanOrEqual(10);
    expect(JSON.parse(moves[moves.length - 1]!)).toMatchObject({ x: 149, y: 200 });
    // a drop: it comes back on its own
    sockets[0]!.readyState = 3;
    sockets[0]!.onclose!({ code: 1006 });
    expect(statuses).toContain('reconnecting');
    vi.advanceTimersByTime(20_000);
    expect(sockets.length).toBe(2);
    // refused by the server: no retry loop
    sockets[1]!.onclose!({ code: 4001 });
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(2);
    expect(statuses.at(-1)).toBe('closed');
    c.close();
  });
});
