import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  CREATURES_BY_ID,
  ELEMENT_INFO,
  instanceStats,
  ivPercent,
  nftGrade,
  type Ivs,
  type NftGrade,
  type Rarity,
} from '@nyrgo/shared';

/**
 * The picture of one creature NFT: a trading card with the painted portrait, the frame in the
 * rarity's colour, the edition ("#12 / 1000"), the grade from its IVs and its four stats. Fixed at
 * mint, so the same token always draws the same card.
 */

export interface CardData {
  species: string;
  level: number;
  ivs: Ivs;
  edition: number | null;
  supply: number | null;
}

const RARITY: Record<Rarity, { es: string; frame: string; glow: string }> = {
  common: { es: 'Común', frame: '#9db8ab', glow: '#e3f0ea' },
  uncommon: { es: 'Poco común', frame: '#43f289', glow: '#d9ffe9' },
  rare: { es: 'Rara', frame: '#3fb0ee', glow: '#d8f1ff' },
  epic: { es: 'Épica', frame: '#9b4ff5', glow: '#eddcff' },
  legendary: { es: 'Legendaria', frame: '#ffcf4d', glow: '#fff3cf' },
  mythic: { es: 'Mítica', frame: '#ff6fae', glow: '#ffe0ee' },
};

const GRADE: Record<NftGrade, string> = {
  D: '#9aa7b0',
  C: '#7fd36c',
  B: '#3fb0ee',
  A: '#9b4ff5',
  S: '#ffb300',
};

const STAT_LABEL = { hp: 'PV', atk: 'ATQ', def: 'DEF', spd: 'VEL' } as const;
/** Bars are drawn against this, so a strong epic fills them and a weak common does not. */
const STAT_SCALE = { hp: 260, atk: 220, def: 220, spd: 220 } as const;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const W = 600;
const H = 880;
const INK = '#06222b';
const FONT = "'Fredoka', 'DejaVu Sans', 'Inter', sans-serif";

/** Renders the card as PNG. `artDir` holds `creatures/<id>.webp` (the web app's public folder). */
export async function renderCard(artDir: string, d: CardData): Promise<Buffer> {
  const def = CREATURES_BY_ID.get(d.species);
  if (!def) throw new Error(`unknown species ${d.species}`);
  const r = RARITY[def.rarity];
  const el = ELEMENT_INFO[def.element];
  const grade = nftGrade(d.ivs);
  const stats = instanceStats(def.stats, d.level, d.ivs);

  // the painted portrait, cropped to the card's window
  const art = await sharp(await readFile(join(artDir, 'creatures', `${def.id}.webp`)))
    .resize(520, 470, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const levelW = 62 + String(d.level).length * 12;
  const edition =
    d.edition !== null && d.supply !== null ? `#${d.edition} / ${d.supply}` : 'Sin acuñar';
  const rows = (['hp', 'atk', 'def', 'spd'] as const)
    .map((k, i) => {
      const y = 640 + i * 46;
      const w = Math.max(6, Math.min(1, stats[k] / STAT_SCALE[k]) * 250);
      return `
      <text x="64" y="${y + 17}" class="lbl">${STAT_LABEL[k]}</text>
      <text x="170" y="${y + 18}" class="val" text-anchor="end">${stats[k]}</text>
      <rect x="186" y="${y}" width="250" height="20" rx="10" fill="#e4eef0" stroke="${INK}" stroke-width="3"/>
      <rect x="186" y="${y}" width="${w.toFixed(1)}" height="20" rx="10" fill="${el.color}" stroke="${INK}" stroke-width="3"/>
      <text x="536" y="${y + 17}" class="iv" text-anchor="end">IV ${d.ivs[k]}/15</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    .name { font: 700 40px ${FONT}; fill: ${INK}; }
    .ed { font: 700 24px ${FONT}; fill: ${INK}; }
    .lbl { font: 700 20px ${FONT}; fill: ${INK}; }
    .val { font: 700 22px ${FONT}; fill: ${INK}; }
    .iv { font: 600 18px ${FONT}; fill: #3b5962; }
    .small { font: 600 18px ${FONT}; fill: #3b5962; }
    .chip { font: 700 18px ${FONT}; fill: ${INK}; }
    .grade { font: 800 64px ${FONT}; fill: #ffffff; }
  </style>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${r.glow}"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <clipPath id="win"><rect x="40" y="110" width="520" height="470" rx="18"/></clipPath>
  </defs>
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="36" fill="${r.frame}" stroke="${INK}" stroke-width="8"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="24" fill="url(#bg)" stroke="${INK}" stroke-width="4"/>
  <text x="44" y="82" class="name">${esc(def.name)}</text>
  <text x="556" y="80" class="ed" text-anchor="end">${esc(edition)}</text>
  <image x="40" y="110" width="520" height="470" clip-path="url(#win)" href="data:image/png;base64,${art.toString('base64')}"/>
  <rect x="40" y="110" width="520" height="470" rx="18" fill="none" stroke="${INK}" stroke-width="5"/>
  <circle cx="498" cy="172" r="48" fill="${GRADE[grade]}" stroke="${INK}" stroke-width="6"/>
  <text x="498" y="195" class="grade" text-anchor="middle">${grade}</text>
  <rect x="52" y="540" width="${38 + el.es.length * 11}" height="30" rx="15" fill="${el.color}" stroke="${INK}" stroke-width="3"/>
  <text x="70" y="561" class="chip">${esc(el.es)}</text>
  <rect x="${548 - levelW}" y="540" width="${levelW}" height="30" rx="15" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
  <text x="${548 - levelW / 2}" y="561" class="chip" text-anchor="middle">Nv. ${d.level}</text>
  <text x="44" y="616" class="small">${esc(r.es)} · Calidad ${ivPercent(d.ivs)} %</text>
  ${rows}
  <text x="300" y="842" class="small" text-anchor="middle">nyrGo! · red de pruebas</text>
</svg>`;
  // 256-colour PNG: a fraction of the size, no visible loss on a painted card
  return sharp(Buffer.from(svg))
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer();
}
