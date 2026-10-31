import { describe, expect, it } from 'vitest';
import { HUB_MAPS, HUB_SPRITES, canStand, interactionAt, walk } from '../src/index.js';

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

  it('lets every door, NPC and the exit be reached on foot from the entrance', () => {
    // flood fill over a 8 px grid from the spawn
    const step = 8;
    const seen = new Set<string>();
    const queue: [number, number][] = [[plaza.spawn.x, plaza.spawn.y]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      const k = `${x},${y}`;
      if (seen.has(k) || !canStand(plaza, x, y)) continue;
      seen.add(k);
      queue.push([x + step, y], [x - step, y], [x, y + step], [x, y - step]);
    }
    for (const i of plaza.interactions) {
      const reachable = [...seen].some((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        return Math.hypot(x - i.x, y - i.y) <= i.radius;
      });
      expect(reachable, i.id).toBe(true);
    }
  });

  it('slides along walls instead of stopping dead', () => {
    const wall = plaza.objects.find((o) => o.sprite === 'portal')!.solid[0]!;
    const from = { x: wall.x + 40, y: wall.y - 2 };
    const to = walk(plaza, from, { x: from.x + 10, y: from.y + 10 });
    expect(to).toEqual({ x: from.x + 10, y: from.y });
  });
});
