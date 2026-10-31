/**
 * Builds the public website (nyrgo.fun) into dist/: page.html once per language (English at /,
 * the others at /<code>/, text in locales/), filled with the game's creatures, elements and NFT supplies
 * from @nyrgo/shared, plus static/ and the art copied from the
 * web app, so the site never drifts from the game.
 *
 *   pnpm --filter @nyrgo/shared build && pnpm --filter @nyrgo/site build
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { feature } from 'topojson-client';
import { BUILT, LANGS, MISSING, RARITY, TEXT, type Lang, type TextKey } from './i18n.mjs';
import {
  CREATURES,
  ELEMENT_INFO,
  ELEMENTS,
  NFT_SUPPLY_BY_RARITY,
  type Rarity,
} from '@nyrgo/shared';

const OUT = 'dist';
const ART = '../web/public';
/** Where the game itself lives; the page links there. */
const APP_URL = process.env.SITE_APP_URL ?? 'https://app.nyrgo.fun';
/** Set when the game is open to players; until then the play button says "coming soon". */
// the game is open to everyone; SITE_APP_OPEN=false shows "coming soon" instead of the link
const APP_OPEN = process.env.SITE_APP_OPEN !== 'false';

/** The API the page reads public data from (the latest catches on the globe). */
const API_URL = process.env.SITE_API_URL ?? 'https://api.nyrgo.fun';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
cpSync('static', OUT, { recursive: true });

// art from the game
cpSync(join(ART, 'creatures'), join(OUT, 'assets/creatures'), {
  recursive: true,
  filter: (f) => !f.endsWith('-thumb.webp'),
});
for (const f of [
  'header-1600.webp',
  'header-800.webp',
  'logo.webp',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
]) {
  cpSync(join(ART, f), join(OUT, 'assets', f));
}
// the game's font, self-hosted
const font = dirname(
  createRequire(import.meta.url).resolve('@fontsource-variable/fredoka/package.json'),
);
cpSync(join(font, 'files/fredoka-latin-wght-normal.woff2'), join(OUT, 'assets/fredoka.woff2'));

// The globe's land: Natural Earth (via world-atlas, public domain) rasterised once at build time
// into a small equirectangular bit mask, plus each creature's name and element colour.
{
  const req = createRequire(import.meta.url);
  const topo = JSON.parse(readFileSync(req.resolve('world-atlas/land-110m.json'), 'utf8'));
  const land = feature(topo, topo.objects.land) as unknown as {
    features: { geometry: { type: string; coordinates: number[][][][] | number[][][] } }[];
  };
  const polys: { rings: number[][][]; box: number[] }[] = [];
  for (const f of land.features) {
    const g = f.geometry;
    const list = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
    for (const rings of list) {
      const xs = rings[0]!.map((p) => p[0]!);
      const ys = rings[0]!.map((p) => p[1]!);
      polys.push({
        rings,
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      });
    }
  }
  const inRing = (x: number, y: number, ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!)
        inside = !inside;
    }
    return inside;
  };
  const W = 256;
  const H = 128;
  const bytes = new Uint8Array((W * H) / 8);
  for (let j = 0; j < H; j++) {
    const lat = 90 - ((j + 0.5) / H) * 180;
    for (let i = 0; i < W; i++) {
      const lng = ((i + 0.5) / W) * 360 - 180;
      const hit = polys.some(
        (p) =>
          lng >= p.box[0]! &&
          lng <= p.box[2]! &&
          lat >= p.box[1]! &&
          lat <= p.box[3]! &&
          inRing(lng, lat, p.rings[0]!) &&
          !p.rings.slice(1).some((h) => inRing(lng, lat, h)),
      );
      if (hit) bytes[(j * W + i) >> 3]! |= 0x80 >> ((j * W + i) & 7);
    }
  }
  const creatures = Object.fromEntries(
    CREATURES.map((c) => [c.id, [c.name, ELEMENT_INFO[c.element].color]]),
  );
  writeFileSync(
    join(OUT, 'globe-data.js'),
    `window.NYRGO_GLOBE=${JSON.stringify({
      land: { w: W, h: H, bits: Buffer.from(bytes).toString('base64') },
      creatures,
    })};\n`,
  );
}

/** A small seeded generator, so the background is the same on every build. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function render(lang: Lang): string {
  const t = TEXT[lang];
  const { locale } = LANGS[lang];
  // game content (element names, lore) exists in English and Spanish; other pages show English
  const gl = lang === 'es' ? 'es' : 'en';
  const name = (e: keyof typeof ELEMENT_INFO) => ELEMENT_INFO[e][gl];
  const chip = (e: keyof typeof ELEMENT_INFO) =>
    `<span class="chip" style="--el:${ELEMENT_INFO[e].color}">${esc(name(e))}</span>`;

  const creaturesHtml = CREATURES.map(
    (c) => `
        <article class="creature" data-element="${c.element}" data-rarity="${c.rarity}">
          <img src="/assets/creatures/${c.id}.webp" alt="${esc(c.name)}" loading="lazy" decoding="async" width="384" height="567">
          <div class="info">
            <h3><span class="dexno">#${String(c.dex).padStart(3, '0')}</span> ${esc(c.name)}</h3>
            <p class="tags">${chip(c.element)}<span class="rar rar-${c.rarity}">${RARITY[lang][c.rarity]}</span></p>
            <p class="lore">${esc(c.lore[gl])}</p>
          </div>
        </article>`,
  ).join('');

  const filtersHtml = [
    `<button type="button" class="filter on" data-filter="all" aria-pressed="true">${esc(t.all)}</button>`,
    ...ELEMENTS.map(
      (e) =>
        `<button type="button" class="filter" data-filter="${e}" aria-pressed="false" style="--el:${ELEMENT_INFO[e].color}">${esc(name(e))}</button>`,
    ),
  ].join('');

  const rarities = Object.keys(NFT_SUPPLY_BY_RARITY) as Rarity[];
  const supplyHtml = rarities
    .map((r) => {
      const species = CREATURES.filter((c) => c.rarity === r).length;
      return `
            <tr><th scope="row"><span class="rar rar-${r}">${RARITY[lang][r]}</span></th><td>${species}</td><td>${NFT_SUPPLY_BY_RARITY[r].toLocaleString(locale)}</td></tr>`;
    })
    .join('');
  const total = CREATURES.reduce((n, c) => n + NFT_SUPPLY_BY_RARITY[c.rarity], 0);

  // the app opens in English unless told otherwise: pass this page's language along
  const appLink = lang === 'en' ? APP_URL : `${APP_URL}/?lang=${lang}`;
  const play = APP_OPEN
    ? `<a class="btn btn-play" href="${esc(appLink)}">${esc(t.playNow)}</a>`
    : `<span class="btn btn-play soon" aria-disabled="true">${esc(t.soon)}</span>`;

  const playTop = APP_OPEN
    ? `<a class="btn btn-play btn-small" href="${esc(appLink)}">${esc(t.navCta)}</a>`
    : '';

  // creatures drifting behind the page: spread over a grid of cells so they never pile up,
  // jittered so it does not look like a grid; the same every build
  const rand = mulberry(7);
  const pick = [...CREATURES].sort((a, b) => a.dex - b.dex).filter((_, i) => i % 3 === 0);
  const cols = 4;
  const bgHtml = pick
    .map((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = ((col + 0.15 + rand() * 0.7) / cols) * 100;
      const rows = Math.ceil(pick.length / cols);
      const y = ((row + 0.1 + rand() * 0.8) / rows) * 100;
      const size = 110 + Math.round(rand() * 110);
      const dur = 14 + Math.round(rand() * 12);
      const tilt = Math.round(rand() * 16 - 8);
      const far = rand() < 0.4 ? ' far' : '';
      return `<img class="bg-c${far}" src="/assets/bg/${c.id}.webp" alt="" decoding="async" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--s:${size}px;--d:${dur}s;--r:${tilt}deg;--delay:-${(rand() * dur).toFixed(1)}s">`;
    })
    .join('');

  const langs = BUILT;
  const flag = (l: Lang) =>
    `<img src="/assets/flags/${LANGS[l].flag}.webp" alt="" width="22" height="16" />`;
  const switchHtml = `<details class="lang">
          <summary aria-label="${esc(t.langLabel!)}: ${esc(LANGS[lang].name)}">${flag(lang)}<span>${LANGS[lang].label}</span></summary>
          <ul>${langs
            .map((l) =>
              l === lang
                ? `<li><span class="on" aria-current="true" lang="${l}">${flag(l)}${esc(LANGS[l].name)}</span></li>`
                : `<li><a href="${LANGS[l].path}" hreflang="${l}" lang="${l}" data-lang="${l}">${flag(l)}${esc(LANGS[l].name)}</a></li>`,
            )
            .join('')}</ul>
        </details>`;
  const alternates = [
    ...langs.map(
      (l) => `<link rel="alternate" hreflang="${l}" href="https://nyrgo.fun${LANGS[l].path}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="https://nyrgo.fun/" />`,
  ].join('\n    ');

  // text first (it may hold the data placeholders), then the data
  return readFileSync('page.html', 'utf8')
    .replace(/\{\{t:(\w+)\}\}/g, (_, k: string) => {
      if (!(k in t)) throw new Error(`missing text ${k} (${lang})`);
      return t[k as TextKey]!;
    })
    .replaceAll('{{LANG}}', lang)
    .replaceAll('{{DIR}}', LANGS[lang].rtl ? 'rtl' : 'ltr')
    .replaceAll('{{LANGCODES}}', BUILT.join(','))
    .replaceAll('{{API}}', esc(API_URL))
    .replaceAll('{{PATH}}', LANGS[lang].path)
    .replaceAll('{{OGLOCALE}}', locale.replace('-', '_'))
    .replaceAll('{{ALTERNATES}}', alternates)
    .replaceAll('{{LANGSWITCH}}', switchHtml)
    .replaceAll('{{PLAY}}', play)
    .replaceAll('{{PLAYTOP}}', playTop)
    .replaceAll('{{BGCREATURES}}', bgHtml)
    .replaceAll('{{COUNT}}', String(CREATURES.length))
    .replaceAll('{{ELEMENTS}}', String(ELEMENTS.length))
    .replaceAll('{{FILTERS}}', filtersHtml)
    .replaceAll('{{CREATURES}}', creaturesHtml)
    .replaceAll('{{SUPPLY}}', supplyHtml)
    .replaceAll('{{TOTAL}}', total.toLocaleString(locale))
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
}

for (const [l, keys] of Object.entries(MISSING)) {
  process.stdout.write(`note: ${l} has no text for ${keys.join(', ')} (English used)\n`);
}
for (const lang of BUILT) {
  const html = render(lang);
  if (/\{\{[\w:]+\}\}/.test(html)) throw new Error(`unfilled placeholder in the ${lang} page`);
  const dir = join(OUT, LANGS[lang].path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}
process.stdout.write(
  `site built in ${OUT}/ (${BUILT.join(', ')}; ${CREATURES.length} creatures, app ${APP_OPEN ? 'open' : 'coming soon'})\n`,
);
