/**
 * Coloured smoke, sparks and light for the starter chest, drawn on one canvas. Puffs are
 * pre-rendered soft sprites per colour, so a few hundred of them stay cheap on a phone.
 */

type Kind = 'smoke' | 'glow' | 'spark' | 'ring';

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  alpha: number;
  color: string;
  spin: number;
  drag: number;
  lift: number;
}

export interface Smoke {
  /** A big coloured eruption from (x, y), shared out between the colours. */
  burst(x: number, y: number, colors: string[], power?: number): void;
  /** A column of smoke drifting from (x, y) towards (tx, ty). */
  plume(x: number, y: number, tx: number, ty: number, color: string, amount?: number): void;
  /** Sparks flying out of (x, y). */
  sparks(x: number, y: number, color: string, n?: number, speed?: number): void;
  /** An expanding ring of light. */
  ring(x: number, y: number, color: string, size?: number): void;
  /** A slow glow that hangs in the air. */
  glow(x: number, y: number, color: string, r?: number): void;
  /** Smoke that keeps rising gently from (x, y) until stopped. */
  steady(x: number, y: number, colors: string[]): () => void;
  stop(): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const NONE: Smoke = {
  burst() {},
  plume() {},
  sparks() {},
  ring() {},
  glow() {},
  steady: () => () => undefined,
  stop() {},
};

export function createSmoke(canvas: HTMLCanvasElement, lite = false): Smoke {
  let maybe: CanvasRenderingContext2D | null = null;
  try {
    maybe = canvas.getContext('2d');
  } catch {
    // no canvas here (tests, very old browsers): the show goes on without smoke
  }
  if (!maybe) return NONE;
  const ctx = maybe;
  const ps: P[] = [];
  const sprites = new Map<string, HTMLCanvasElement>();
  const cap = lite ? 160 : 520;
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = performance.now();
  const timers = new Set<number>();

  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const b = canvas.getBoundingClientRect();
    w = b.width;
    h = b.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
  ro?.observe(canvas);

  function sprite(color: string, hard = false): HTMLCanvasElement {
    const key = color + (hard ? '!' : '');
    let s = sprites.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = 64;
    const c = s.getContext('2d')!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (hard) {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      g.addColorStop(0, color);
      g.addColorStop(0.45, color + '99');
      g.addColorStop(1, color + '00');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    sprites.set(key, s);
    return s;
  }

  function add(p: Partial<P> & Pick<P, 'kind' | 'x' | 'y' | 'color'>) {
    if (ps.length >= cap) ps.shift();
    ps.push({
      vx: 0,
      vy: 0,
      r: 10,
      grow: 0,
      life: 0,
      max: 1,
      alpha: 1,
      spin: 0,
      drag: 0.6,
      lift: 0,
      ...p,
    });
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life += dt;
      if (p.life >= p.max) {
        ps.splice(i, 1);
        continue;
      }
      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy = p.vy * k - p.lift * dt;
      p.x += p.vx * dt + Math.sin((p.life + p.spin) * 2) * p.spin * dt * 8;
      p.y += p.vy * dt;
      p.r += p.grow * dt;
      const t = p.life / p.max;
      // fade in quickly, out slowly
      const a = p.alpha * Math.min(1, t * 6) * (1 - t) * (1 - t);
      if (a <= 0.004) continue;
      ctx.globalAlpha = Math.min(1, a);
      if (p.kind === 'ring') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 10 * (1 - t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        const s = sprite(p.color, true);
        ctx.drawImage(s, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        // a short streak behind fast sparks
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.r * 0.35;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.globalCompositeOperation = p.kind === 'glow' ? 'lighter' : 'source-over';
        const s = sprite(p.color);
        ctx.drawImage(s, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const n = (x: number) => Math.max(1, Math.round(lite ? x / 3 : x));

  return {
    burst(x, y, colors, power = 1) {
      for (let i = 0; i < n(110 * power); i++) {
        const color = colors[i % colors.length]!;
        // mostly upwards, fanning out
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
        const v = rand(80, 520) * power;
        add({
          kind: 'smoke',
          x: x + rand(-20, 20),
          y: y + rand(-6, 6),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          r: rand(18, 40),
          grow: rand(30, 80),
          max: rand(1.6, 3.2),
          alpha: rand(0.35, 0.7),
          drag: 0.12,
          lift: rand(10, 40),
          spin: rand(-3, 3),
          color,
        });
      }
      for (let i = 0; i < n(8); i++) {
        add({
          kind: 'glow',
          x,
          y,
          vx: rand(-60, 60),
          vy: rand(-160, -20),
          r: rand(50, 100),
          grow: 40,
          max: rand(0.8, 1.4),
          alpha: 0.22,
          drag: 0.2,
          color: colors[i % colors.length]!,
        });
      }
    },
    plume(x, y, tx, ty, color, amount = 1) {
      const dx = tx - x;
      const dy = ty - y;
      for (let i = 0; i < n(36 * amount); i++) {
        const s = rand(0.6, 1.25);
        add({
          kind: 'smoke',
          x: x + rand(-12, 12),
          y: y + rand(-8, 8),
          vx: dx * s * rand(0.9, 1.2) + rand(-30, 30),
          vy: dy * s * rand(0.9, 1.2) + rand(-30, 30),
          r: rand(12, 28),
          grow: rand(30, 60),
          max: rand(1.4, 2.6),
          alpha: rand(0.4, 0.75),
          drag: 0.25,
          lift: 15,
          spin: rand(-2, 2),
          color,
        });
      }
    },
    sparks(x, y, color, count = 40, speed = 1) {
      for (let i = 0; i < n(count); i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(120, 620) * speed;
        add({
          kind: 'spark',
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 80,
          r: rand(2, 5),
          max: rand(0.6, 1.5),
          drag: 0.18,
          lift: -260,
          alpha: 1,
          color,
        });
      }
    },
    ring(x, y, color, s = 1) {
      add({ kind: 'ring', x, y, r: 10, grow: 520 * s, max: 0.7, alpha: 0.9, drag: 1, color });
    },
    glow(x, y, color, r = 90) {
      add({ kind: 'glow', x, y, r, grow: 20, max: 1.6, alpha: 0.3, drag: 1, color });
    },
    steady(x, y, colors) {
      let i = 0;
      const id = window.setInterval(
        () => {
          const color = colors[i++ % colors.length]!;
          add({
            kind: 'smoke',
            x: x + rand(-40, 40),
            y: y + rand(-6, 6),
            vx: rand(-20, 20),
            vy: rand(-70, -30),
            r: rand(14, 26),
            grow: rand(14, 30),
            max: rand(2.2, 3.4),
            alpha: rand(0.4, 0.65),
            drag: 0.6,
            lift: 6,
            spin: rand(-2, 2),
            color,
          });
        },
        lite ? 260 : 90,
      );
      timers.add(id);
      return () => {
        window.clearInterval(id);
        timers.delete(id);
      };
    },
    stop() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      for (const id of timers) window.clearInterval(id);
      ps.length = 0;
    },
  };
}
