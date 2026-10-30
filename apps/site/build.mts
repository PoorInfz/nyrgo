/**
 * Builds the public website (nyrgo.fun) into dist/: page.html once per language (English at /,
 * Spanish at /es/, text in i18n.mts), filled with the game's creatures, elements and NFT supplies
 * from @nyrgo/shared, plus static/ and the art copied from the
 * web app, so the site never drifts from the game.
 *
 *   pnpm --filter @nyrgo/shared build && pnpm --filter @nyrgo/site build
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { LANGS, RARITY, TEXT, type Lang, type TextKey } from './i18n.mjs';
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
const APP_OPEN = process.env.SITE_APP_OPEN === 'true';

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
const starters = CREATURES.filter((c) => c.starter);
mkdirSync(join(OUT, 'assets/sprites'), { recursive: true });
for (const c of starters) {
  cpSync(join(ART, 'sprites', `${c.id}-idle.webp`), join(OUT, `assets/sprites/${c.id}-idle.webp`));
}
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

function render(lang: Lang): string {
  const t = TEXT[lang];
  const { locale } = LANGS[lang];
  const name = (e: keyof typeof ELEMENT_INFO) => ELEMENT_INFO[e][lang];
  const chip = (e: keyof typeof ELEMENT_INFO) =>
    `<span class="chip" style="--el:${ELEMENT_INFO[e].color}">${esc(name(e))}</span>`;

  const startersHtml = starters
    .map(
      (c) => `
        <figure class="starter">
          <div class="sprite" style="--sheet:url(/assets/sprites/${c.id}-idle.webp)" role="img" aria-label="${esc(c.name)}"></div>
          <div class="platform"></div>
          <figcaption>${esc(c.name)} ${chip(c.element)}</figcaption>
        </figure>`,
    )
    .join('');

  const creaturesHtml = CREATURES.map(
    (c) => `
        <article class="creature" data-element="${c.element}" data-rarity="${c.rarity}">
          <img src="/assets/creatures/${c.id}.webp" alt="${esc(c.name)}" loading="lazy" decoding="async" width="384" height="567">
          <div class="info">
            <h3><span class="dexno">#${String(c.dex).padStart(3, '0')}</span> ${esc(c.name)}</h3>
            <p class="tags">${chip(c.element)}<span class="rar rar-${c.rarity}">${RARITY[lang][c.rarity]}</span></p>
            <p class="lore">${esc(c.lore[lang])}</p>
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

  const play = APP_OPEN
    ? `<a class="btn btn-play" href="${esc(APP_URL)}">${esc(t.playNow)}</a>`
    : `<span class="btn btn-play soon" aria-disabled="true">${esc(t.soon)}</span>`;

  const langs = Object.keys(LANGS) as Lang[];
  const switchHtml = langs
    .map((l) =>
      l === lang
        ? `<span class="on" aria-current="true" lang="${l}" title="${LANGS[l].name}">${LANGS[l].label}</span>`
        : `<a href="${LANGS[l].path}" hreflang="${l}" lang="${l}" data-lang="${l}" title="${LANGS[l].name}">${LANGS[l].label}</a>`,
    )
    .join('');
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
      return t[k as TextKey];
    })
    .replaceAll('{{LANG}}', lang)
    .replaceAll('{{PATH}}', LANGS[lang].path)
    .replaceAll('{{OGLOCALE}}', locale.replace('-', '_'))
    .replaceAll('{{ALTERNATES}}', alternates)
    .replaceAll('{{LANGSWITCH}}', switchHtml)
    .replaceAll('{{PLAY}}', play)
    .replaceAll('{{COUNT}}', String(CREATURES.length))
    .replaceAll('{{ELEMENTS}}', String(ELEMENTS.length))
    .replaceAll('{{STARTERS}}', startersHtml)
    .replaceAll('{{FILTERS}}', filtersHtml)
    .replaceAll('{{CREATURES}}', creaturesHtml)
    .replaceAll('{{SUPPLY}}', supplyHtml)
    .replaceAll('{{TOTAL}}', total.toLocaleString(locale))
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
}

for (const lang of Object.keys(LANGS) as Lang[]) {
  const html = render(lang);
  if (/\{\{[\w:]+\}\}/.test(html)) throw new Error(`unfilled placeholder in the ${lang} page`);
  const dir = join(OUT, LANGS[lang].path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}
process.stdout.write(
  `site built in ${OUT}/ (${Object.keys(LANGS).join(', ')}; ${CREATURES.length} creatures, app ${APP_OPEN ? 'open' : 'coming soon'})\n`,
);
