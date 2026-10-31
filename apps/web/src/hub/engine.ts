import {
  FURNITURE_BY_ID,
  HUB_SPRITES,
  TILE,
  interactionAt,
  walk,
  type AvatarLook,
  type HubMap,
  type Interaction,
} from '@nyrgo/shared';
import {
  EXPLORER,
  companionSheet,
  explorerFrames,
  groundImage,
  ready,
  townSprite,
} from './sprites';

/**
 * The town on a canvas: the owner's art, the player and the others, their creatures, names,
 * speech and emotes. The local player moves at once (prediction); the server's answer only
 * corrects it when a move was refused. Others glide to their latest known position.
 */

/** Walking speed in tiles per second (the server allows up to `hub.maxSpeedTiles`). */
export const WALK_TILES = 4;

export interface Body {
  id: string;
  name: string;
  level: number;
  look: AvatarLook;
  companion: string | null;
  /** Drawn position (feet), and where it is heading. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 'l' | 'r';
  moving: boolean;
  /** Recent positions, for the companion to follow. */
  trail: { x: number; y: number }[];
  bubble: { text: string; until: number } | null;
  emote: { e: string; until: number } | null;
  /** Whether the latest state still includes this body. */
  seen: boolean;
}

export const EMOTE_ICONS: Record<string, string> = {
  wave: '👋',
  heart: '💖',
  laugh: '😂',
  cheer: '🎉',
  question: '❓',
  sad: '😢',
};

export function newBody(p: {
  id: string;
  name: string;
  level: number;
  look: AvatarLook;
  companion: string | null;
  x: number;
  y: number;
}): Body {
  return {
    ...p,
    tx: p.x,
    ty: p.y,
    facing: 'r',
    moving: false,
    trail: [],
    bubble: null,
    emote: null,
    seen: true,
  };
}

export class Town {
  bodies = new Map<string, Body>();
  meId: string | null = null;
  /** Input direction for the local player, -1…1 on each axis. */
  input = { x: 0, y: 0 };
  camera = { x: 0, y: 0, zoom: 1 };
  /** In a house: the owner's furniture, each standing with its bottom centre at (x, y). */
  furniture: { f: string; x: number; y: number; flip: boolean }[] = [];
  private groundPattern = new Map<string, CanvasPattern | null>();
  private time = 0;

  constructor(public map: HubMap) {}

  /** Moves the view to another room (a building's inside, or back to the square). */
  setMap(map: HubMap) {
    if (map === this.map) return;
    this.map = map;
    this.furniture = [];
    const me = this.me();
    this.bodies.clear();
    if (me) {
      me.trail = [];
      this.bodies.set(me.id, me);
    }
  }

  me(): Body | undefined {
    return this.meId ? this.bodies.get(this.meId) : undefined;
  }

  /** The thing within reach of the local player, if any. */
  nearby(): Interaction | null {
    const me = this.me();
    return me ? interactionAt(this.map, me.x, me.y) : null;
  }

  /** Advances the world by `dt` seconds; returns whether the local player moved. */
  update(dt: number, now: number): boolean {
    this.time = now;
    let moved = false;
    const me = this.me();
    if (me) {
      const len = Math.hypot(this.input.x, this.input.y);
      if (len > 0.15) {
        const k = Math.min(1, len);
        const speed = WALK_TILES * TILE * k;
        const nx = me.x + (this.input.x / len) * speed * dt;
        const ny = me.y + (this.input.y / len) * speed * dt;
        const to = walk(this.map, { x: me.x, y: me.y }, { x: nx, y: ny });
        moved = to.x !== me.x || to.y !== me.y;
        me.x = me.tx = to.x;
        me.y = me.ty = to.y;
        if (Math.abs(this.input.x) > 0.2) me.facing = this.input.x < 0 ? 'l' : 'r';
        me.moving = moved;
      } else {
        me.moving = false;
      }
    }
    for (const b of this.bodies.values()) {
      if (b !== me) {
        // glide towards the last known position (positions arrive ten times a second)
        const k = Math.min(1, dt * 10);
        b.x += (b.tx - b.x) * k;
        b.y += (b.ty - b.y) * k;
      }
      const last = b.trail[b.trail.length - 1];
      if (!last || Math.hypot(last.x - b.x, last.y - b.y) > 4) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 12) b.trail.shift();
      }
      if (b.bubble && b.bubble.until < now) b.bubble = null;
      if (b.emote && b.emote.until < now) b.emote = null;
    }
    return moved;
  }

  /** Puts the camera on the local player, kept inside the map. */
  follow(viewW: number, viewH: number) {
    const me = this.me();
    const z = this.camera.zoom;
    const w = viewW / z;
    const h = viewH / z;
    const cx = me ? me.x : this.map.spawn.x;
    const cy = me ? me.y - 30 : this.map.spawn.y;
    this.camera.x = Math.max(0, Math.min(this.map.width - w, cx - w / 2));
    this.camera.y = Math.max(0, Math.min(this.map.height - h, cy - h / 2));
    if (w > this.map.width) this.camera.x = (this.map.width - w) / 2;
    if (h > this.map.height) this.camera.y = (this.map.height - h) / 2;
  }

  private pattern(ctx: CanvasRenderingContext2D, name: Parameters<typeof groundImage>[0]) {
    if (this.groundPattern.get(name)) return this.groundPattern.get(name)!;
    const img = groundImage(name);
    if (!ready(img)) return null;
    const p = ctx.createPattern(img, 'repeat');
    this.groundPattern.set(name, p);
    return p;
  }

  draw(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, dpr: number) {
    const { x: camX, y: camY, zoom } = this.camera;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camX * dpr * zoom, -camY * dpr * zoom);
    ctx.imageSmoothingEnabled = false;
    const view = { x: camX, y: camY, w: viewW / zoom, h: viewH / zoom };

    // ground: a repeated texture outdoors; indoors the room's picture is the floor
    if (this.map.ground) {
      ctx.fillStyle = this.pattern(ctx, this.map.ground) ?? '#45ad4d';
      ctx.fillRect(view.x, view.y, view.w, view.h);
    } else {
      ctx.fillStyle = '#0b0d14';
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }
    const bg = this.map.background;
    if (bg) {
      const img = townSprite(bg.sprite);
      const s = HUB_SPRITES[bg.sprite];
      if (ready(img)) ctx.drawImage(img, 0, 0, s.w * bg.scale, s.h * bg.scale);
    }
    // rugs lie on the floor, under everyone
    for (const p of this.furniture) if (FURNITURE_BY_ID.get(p.f)?.rug) this.drawPiece(ctx, p);
    for (const p of this.map.patches) {
      const pat = this.pattern(ctx, p.ground);
      ctx.fillStyle = pat ?? '#e8c47a';
      ctx.fillRect(p.rect.x, p.rect.y, p.rect.w, p.rect.h);
    }

    // everything that stands, sorted by where it touches the ground
    type Drawable = { base: number; draw: () => void };
    const items: Drawable[] = [];
    const inView = (x: number, y: number, w: number, h: number) =>
      x + w > view.x && x < view.x + view.w && y + h > view.y && y < view.y + view.h;

    for (const o of this.map.objects) {
      const s = HUB_SPRITES[o.sprite];
      if (!inView(o.x, o.y, s.w, s.h)) continue;
      // the plaza is a floor, always under people; anything else sorts by the bottom of its
      // solid part (its feet), so people standing in front of it are drawn in front
      const base =
        o.sprite === 'plaza'
          ? -1
          : o.solid.length
            ? Math.max(...o.solid.map((r) => r.y + r.h))
            : o.y + s.h;
      items.push({
        base,
        draw: () => {
          const img = townSprite(o.sprite);
          if (ready(img)) ctx.drawImage(img, o.x, o.y);
        },
      });
    }
    for (const p of this.furniture) {
      if (FURNITURE_BY_ID.get(p.f)?.rug) continue;
      items.push({ base: p.y, draw: () => this.drawPiece(ctx, p) });
    }
    for (const n of this.map.npcs) {
      if (!inView(n.x - 30, n.y - 70, 60, 80)) continue;
      items.push({
        base: n.y,
        draw: () =>
          this.drawExplorer(ctx, n.look, n.x, n.y, n.facing === 'left' ? 'l' : 'r', false),
      });
    }
    for (const b of this.bodies.values()) {
      if (!inView(b.x - 60, b.y - 90, 120, 100)) continue;
      const pet = b.trail[0];
      if (b.companion && pet) {
        const px = pet.x + (b.facing === 'l' ? 18 : -18);
        const py = pet.y + 2;
        items.push({
          base: py,
          draw: () => this.drawCompanion(ctx, b.companion!, px, py, b.facing),
        });
      }
      items.push({
        base: b.y,
        draw: () => this.drawExplorer(ctx, b.look, b.x, b.y, b.facing, b.moving),
      });
    }
    items.sort((a, b) => a.base - b.base);
    for (const i of items) i.draw();

    // labels on top of everything
    for (const n of this.map.npcs) this.label(ctx, n.x, n.y, '★', '#ffcf4d');
    for (const b of this.bodies.values()) {
      if (!inView(b.x - 60, b.y - 120, 120, 140)) continue;
      this.label(ctx, b.x, b.y, b.name, b.id === this.meId ? '#43f289' : '#eef3ff');
      if (b.emote) this.emoteBubble(ctx, b.x, b.y, EMOTE_ICONS[b.emote.e] ?? '•');
      else if (b.bubble) this.speech(ctx, b.x, b.y, b.bubble.text);
    }
  }

  /** A piece of furniture, at the room's scale, standing on (x, y). */
  private drawPiece(
    ctx: CanvasRenderingContext2D,
    p: { f: string; x: number; y: number; flip: boolean },
  ) {
    const def = FURNITURE_BY_ID.get(p.f);
    if (!def) return;
    const img = townSprite(def.sprite);
    if (!ready(img)) return;
    const k = this.map.background?.scale ?? 1;
    const s = HUB_SPRITES[def.sprite];
    const w = s.w * k;
    const h = s.h * k;
    ctx.save();
    ctx.translate(p.x, def.rug ? p.y + h / 2 : p.y);
    if (p.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }

  private drawExplorer(
    ctx: CanvasRenderingContext2D,
    look: AvatarLook,
    x: number,
    y: number,
    facing: 'l' | 'r',
    moving: boolean,
  ) {
    const frames = explorerFrames(look);
    const step = moving ? Math.floor(this.time / 140) % 4 : 0;
    const frame = frames[[0, 1, 0, 2][step]!]!;
    // soft shadow
    ctx.fillStyle = 'rgba(6, 34, 43, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!ready(frame)) return;
    const bob = moving && step % 2 === 1 ? -1.5 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(x, y + bob);
    if (facing === 'l') ctx.scale(-1, 1);
    // the SVG's feet sit at 130/140 of its height
    ctx.drawImage(frame, -EXPLORER.w / 2, -EXPLORER.h * (130 / 140), EXPLORER.w, EXPLORER.h);
    ctx.restore();
  }

  private drawCompanion(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    facing: 'l' | 'r',
  ) {
    const sheet = companionSheet(id);
    if (!ready(sheet)) return;
    const fw = sheet.naturalWidth / 6;
    const fh = sheet.naturalHeight;
    const frame = Math.floor(this.time / 160) % 6;
    const h = 36;
    const w = (h * fw) / fh;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(x, y);
    if (facing === 'l') ctx.scale(-1, 1);
    ctx.drawImage(sheet, frame * fw, 0, fw, fh, -w / 2, -h, w, h);
    ctx.restore();
  }

  private label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 8;
    const top = y - EXPLORER.h - 12;
    ctx.fillStyle = 'rgba(7, 11, 31, 0.72)';
    roundRect(ctx, x - w / 2, top - 9, w, 13, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, top + 1);
  }

  private speech(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const lines = wrap(ctx, text, 150);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
    const h = lines.length * 13 + 8;
    const top = y - EXPLORER.h - 26 - h;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x - w / 2, top, w, h, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 5, top + h);
    ctx.lineTo(x, top + h + 6);
    ctx.lineTo(x + 5, top + h);
    ctx.fill();
    ctx.fillStyle = '#0b1024';
    lines.forEach((l, i) => ctx.fillText(l, x, top + 13 + i * 13));
  }

  private emoteBubble(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string) {
    const top = y - EXPLORER.h - 44;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, top + 10, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '16px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, x, top + 16);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
    if (lines.length === 3) break;
  }
  if (line && lines.length < 3) lines.push(line);
  return lines;
}
