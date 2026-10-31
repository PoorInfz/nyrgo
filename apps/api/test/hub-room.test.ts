import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR, DEFAULT_CONFIG, HUB_MAPS, TILE, canStand } from '@nyrgo/shared';
import { Room, type AgeGroup, type Outgoing } from '../src/modules/hub/room.js';

function fakeSocket() {
  const sent: Outgoing[] = [];
  return {
    sent,
    socket: { send: (d: string) => sent.push(JSON.parse(d) as Outgoing), close: () => {} },
    last: <T extends Outgoing['t']>(t: T) =>
      [...sent].reverse().find((m) => m.t === t) as Extract<Outgoing, { t: T }> | undefined,
  };
}

function setup() {
  let now = 1_000_000;
  const room = new Room('plaza', { now: () => now, autoTick: false });
  const add = (id: string, ageGroup: AgeGroup = 'adult') => {
    const s = fakeSocket();
    const m = room.join({
      userId: id,
      name: id,
      level: 3,
      look: DEFAULT_AVATAR,
      companion: 'gwisp',
      ageGroup,
      muted: new Set(),
      socket: s.socket,
    });
    return { ...s, m };
  };
  return { room, add, later: (ms: number) => (now += ms) };
}

describe('hub room', () => {
  it('starts everyone at a walkable entrance and tells them where they are', () => {
    const { add } = setup();
    const a = add('a');
    expect(canStand(HUB_MAPS.plaza!, a.m.x, a.m.y)).toBe(true);
    expect(a.last('welcome')).toMatchObject({ you: 'a', room: 'plaza', ageGroup: 'adult' });
  });

  it('accepts walking and refuses teleports and walls', () => {
    const { room, add, later } = setup();
    const a = add('a');
    const start = { x: a.m.x, y: a.m.y };
    later(500);
    room.move('a', start.x + 40, start.y, 'r', true);
    expect(a.m.x).toBe(start.x + 40);
    // 20 tiles in a tenth of a second
    later(100);
    room.move('a', a.m.x + 20 * TILE, a.m.y, 'r', true);
    expect(a.m.x).toBe(start.x + 40);
    expect(a.last('pos')).toEqual({ t: 'pos', x: start.x + 40, y: start.y });
    // into the portal's solid body, just below: refused, stays put
    const portal = HUB_MAPS.plaza!.objects.find((o) => o.sprite === 'portal')!.solid[0]!;
    a.m.x = portal.x + portal.w / 2;
    a.m.y = portal.y - 2;
    later(500);
    room.move('a', a.m.x, portal.y + 20, 'r', true);
    expect(a.m.y).toBe(portal.y - 2);
    expect(Number.isNaN(a.m.x)).toBe(false);
    room.move('a', Number.NaN, 5, 'r', true);
    expect(Number.isFinite(a.m.x)).toBe(true);
  });

  it('sends each player only who is near, with looks sent once', () => {
    const { room, add } = setup();
    const a = add('a');
    const b = add('b');
    const far = add('far');
    far.m.x = 40;
    far.m.y = 40;
    a.m.x = HUB_MAPS.plaza!.width - 60;
    room.tick();
    const st = a.last('state')!;
    const ids = st.players.map((p) => p[0]);
    expect(ids).toContain('a');
    expect(ids).not.toContain('far');
    room.tick();
    expect(b.last('state')!.profiles).toBeUndefined();
    const radius = DEFAULT_CONFIG.hub.viewRadius * TILE;
    expect(radius).toBeGreaterThan(200);
  });

  it('keeps chat within an age group, and blocked players apart', () => {
    const { room, add } = setup();
    const adult = add('adult');
    const adult2 = add('adult2');
    const minor = add('minor', 'minor');
    const minor2 = add('minor2', 'minor');
    room.say('adult', '1', 'hello');
    expect(adult2.last('chat')).toMatchObject({ text: 'hello', name: 'adult' });
    expect(minor.last('chat')).toBeUndefined();
    room.say('minor', '2', 'hi');
    expect(minor2.last('chat')).toMatchObject({ text: 'hi' });
    expect(adult.last('chat')?.text).toBe('hello');
    room.setMuted('adult2', 'adult', true);
    room.say('adult', '3', 'are you there');
    expect(adult2.last('chat')?.text).toBe('hello');
    room.setMuted('adult2', 'adult', false);
    room.say('adult', '4', 'now?');
    expect(adult2.last('chat')?.text).toBe('now?');
  });

  it('limits chat per minute and drops repeats', () => {
    const { room, add, later } = setup();
    add('a');
    expect(room.allowChat('a', 'one')).toBe('ok');
    expect(room.allowChat('a', 'one')).toBe('repeat');
    for (let i = 0; i < DEFAULT_CONFIG.hub.chatPerMinute - 1; i++)
      expect(room.allowChat('a', `m${i}`)).toBe('ok');
    expect(room.allowChat('a', 'too many')).toBe('rate_limited');
    later(61_000);
    expect(room.allowChat('a', 'again')).toBe('ok');
  });

  it('accepts only known emotes, shown to players nearby', () => {
    const { room, add } = setup();
    add('a');
    const b = add('b');
    room.emote('a', 'wave');
    room.emote('a', '<script>');
    expect(b.sent.filter((m) => m.t === 'emote')).toEqual([{ t: 'emote', id: 'a', e: 'wave' }]);
  });

  it('replaces an older connection of the same player', () => {
    const { add, room } = setup();
    let closed = false;
    const first = add('a');
    first.socket.close = () => {
      closed = true;
    };
    add('a');
    expect(closed).toBe(true);
    expect(room.members.size).toBe(1);
  });
});
