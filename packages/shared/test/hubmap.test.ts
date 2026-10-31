import { describe, expect, it } from 'vitest';
import {
  FURNITURE,
  HUB_MAPS,
  HUB_SPRITES,
  canStand,
  houseOwnerOf,
  houseRoomId,
  hubMap,
  interactionAt,
  walk,
} from '../src/index.js';

const plaza = HUB_MAPS.plaza!;

describe('the town square map', () => {
  it('uses only sprites that exist, inside the map', () => {
    for (const o of plaza.objects) {
      expect(HUB_SPRITES[o.sprite]).toBeTruthy();
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x + HUB_SPRITES[o.sprite].w).toBeLessThanOrEqual(plaza.width + 1);
    }
  });

  it('starts players on walkable ground next to the way back to the map', () => {
    expect(canStand(plaza, plaza.spawn.x, plaza.spawn.y)).toBe(true);
    expect(interactionAt(plaza, plaza.spawn.x, plaza.spawn.y)?.kind).toBe('exit');
  });

  it('lets every door, NPC and the exit be reached on foot, in every room', () => {
    for (const map of [...Object.values(HUB_MAPS), hubMap(houseRoomId('someone'))!]) reachable(map);
  });

  it('leads every door to a walkable spot in an existing room, and back', () => {
    for (const map of [...Object.values(HUB_MAPS), hubMap(houseRoomId('someone'))!]) {
      for (const i of map.interactions.filter((x) => x.to)) {
        const there = HUB_MAPS[i.to!.room]!;
        expect(there, `${map.id}:${i.id}`).toBeTruthy();
        expect(canStand(there, i.to!.x, i.to!.y), `${map.id}:${i.id}`).toBe(true);
        // arriving next to a door that leads back
        expect(interactionAt(there, i.to!.x, i.to!.y)?.to?.room ?? there.id).toBeTruthy();
      }
    }
    expect(HUB_MAPS.gym!.background?.sprite).toBe('room-gym');
    expect(canStand(HUB_MAPS.gym!, HUB_MAPS.gym!.spawn.x, HUB_MAPS.gym!.spawn.y)).toBe(true);
  });

  it('keeps the square reachable from its entrance (legacy check)', () => {
    reachable(plaza);
  });

  function reachable(map: typeof plaza) {
    // flood fill over a 8 px grid from the spawn
    const step = 8;
    const seen = new Set<string>();
    const queue: [number, number][] = [[map.spawn.x, map.spawn.y]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      const k = `${x},${y}`;
      if (seen.has(k) || !canStand(map, x, y)) continue;
      seen.add(k);
      queue.push([x + step, y], [x - step, y], [x, y + step], [x, y - step]);
    }
    for (const i of map.interactions) {
      const ok = [...seen].some((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        return Math.hypot(x - i.x, y - i.y) <= i.radius;
      });
      expect(ok, `${map.id}:${i.id}`).toBe(true);
    }
  }

  it('slides along walls instead of stopping dead', () => {
    const wall = plaza.objects.find((o) => o.sprite === 'portal')!.solid[0]!;
    const from = { x: wall.x + 40, y: wall.y - 2 };
    const to = walk(plaza, from, { x: from.x + 10, y: from.y + 10 });
    expect(to).toEqual({ x: from.x + 10, y: from.y });
  });
});

describe('houses', () => {
  it('gives every player their own room with the same layout', () => {
    const a = hubMap(houseRoomId('a'))!;
    expect(a.id).toBe('house:a');
    expect(houseOwnerOf(a.id)).toBe('a');
    expect(houseOwnerOf('gym')).toBeNull();
    expect(hubMap('nowhere')).toBeUndefined();
    expect(a.interactions.find((i) => i.id === 'out')?.to?.room).toBe('plaza');
  });
  it('has art for every piece of furniture', () => {
    for (const f of FURNITURE) expect(HUB_SPRITES[f.sprite]).toBeTruthy();
  });
});
