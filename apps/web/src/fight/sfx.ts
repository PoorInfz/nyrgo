/**
 * Fight sounds, synthesised with Web Audio (no sound files). Short, quiet by default, and muted
 * with one tap (remembered on this device).
 */

type Sound =
  'vs' | 'fight' | 'whoosh' | 'hit' | 'crit' | 'miss' | 'heal' | 'ko' | 'win' | 'lose' | 'draw';

const KEY = 'nyrgo-fight-muted';
let ctx: AudioContext | null = null;

export function sfxMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSfxMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    // private mode: the choice lasts until the page closes
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  a: AudioContext,
  o: { f0: number; f1?: number; dur: number; type?: OscillatorType; gain?: number; at?: number },
) {
  const t = a.currentTime + (o.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  g.gain.setValueAtTime(o.gain ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

function noise(
  a: AudioContext,
  o: { dur: number; from: number; to: number; gain?: number; at?: number },
) {
  const t = a.currentTime + (o.at ?? 0);
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * o.dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(o.from, t);
  f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = a.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export function sfx(s: Sound) {
  if (sfxMuted()) return;
  const a = audio();
  if (!a) return;
  try {
    switch (s) {
      case 'vs':
        tone(a, { f0: 110, f1: 40, dur: 0.9, gain: 0.35 });
        noise(a, { dur: 0.7, from: 400, to: 3000, gain: 0.15 });
        tone(a, { f0: 70, f1: 30, dur: 0.8, gain: 0.35, at: 0.55 });
        break;
      case 'fight':
        tone(a, { f0: 523, dur: 0.12, type: 'square', gain: 0.08 });
        tone(a, { f0: 784, dur: 0.25, type: 'square', gain: 0.08, at: 0.12 });
        break;
      case 'whoosh':
        noise(a, { dur: 0.3, from: 600, to: 3200, gain: 0.18 });
        break;
      case 'hit':
        tone(a, { f0: 180, f1: 50, dur: 0.18, gain: 0.35 });
        noise(a, { dur: 0.12, from: 2500, to: 800, gain: 0.25 });
        break;
      case 'crit':
        tone(a, { f0: 220, f1: 40, dur: 0.35, gain: 0.45 });
        noise(a, { dur: 0.25, from: 4000, to: 600, gain: 0.35 });
        tone(a, { f0: 1320, dur: 0.3, type: 'triangle', gain: 0.08, at: 0.05 });
        break;
      case 'miss':
        noise(a, { dur: 0.25, from: 3000, to: 900, gain: 0.12 });
        break;
      case 'heal':
        [660, 880, 1100].forEach((f, i) =>
          tone(a, { f0: f, dur: 0.25, type: 'triangle', gain: 0.07, at: i * 0.07 }),
        );
        break;
      case 'ko':
        tone(a, { f0: 90, f1: 28, dur: 1.4, gain: 0.5 });
        noise(a, { dur: 1.0, from: 1200, to: 200, gain: 0.3 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(a, { f0: f, dur: 0.35, type: 'square', gain: 0.06, at: i * 0.12 }),
        );
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) =>
          tone(a, { f0: f, dur: 0.4, type: 'triangle', gain: 0.08, at: i * 0.18 }),
        );
        break;
      case 'draw':
        tone(a, { f0: 440, dur: 0.4, type: 'triangle', gain: 0.08 });
        break;
    }
  } catch {
    // audio is a nicety
  }
}
