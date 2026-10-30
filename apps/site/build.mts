/**
 * Builds the public website (nyrgo.fun) into dist/: the static page from static/, filled with the
 * game's real creatures, elements and NFT supplies from @nyrgo/shared, and the art copied from the
 * web app, so the site never drifts from the game.
 *
 *   pnpm --filter @nyrgo/shared build && pnpm --filter @nyrgo/site build
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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

const RARITY: Record<Rarity, string> = {
  common: 'Común',
  uncommon: 'Poco común',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Legendaria',
  mythic: 'Mítica',
};

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

const chip = (e: keyof typeof ELEMENT_INFO) =>
  `<span class="chip" style="--el:${ELEMENT_INFO[e].color}">${esc(ELEMENT_INFO[e].es)}</span>`;

const startersHtml = starters
  .map(
    (c) => `
        <figure class="starter">
          <div class="sprite" style="--sheet:url(assets/sprites/${c.id}-idle.webp)" role="img" aria-label="${esc(c.name)}"></div>
          <div class="platform"></div>
          <figcaption>${esc(c.name)} ${chip(c.element)}</figcaption>
        </figure>`,
  )
  .join('');

const creaturesHtml = CREATURES.map(
  (c) => `
        <article class="creature" data-element="${c.element}" data-rarity="${c.rarity}">
          <img src="assets/creatures/${c.id}.webp" alt="${esc(c.name)}" loading="lazy" decoding="async" width="384" height="567">
          <div class="info">
            <h3><span class="dexno">#${String(c.dex).padStart(3, '0')}</span> ${esc(c.name)}</h3>
            <p class="tags">${chip(c.element)}<span class="rar rar-${c.rarity}">${RARITY[c.rarity]}</span></p>
            <p class="lore">${esc(c.lore.es)}</p>
          </div>
        </article>`,
).join('');

const filtersHtml = [
  `<button type="button" class="filter on" data-filter="all">Todas</button>`,
  ...ELEMENTS.map(
    (e) =>
      `<button type="button" class="filter" data-filter="${e}" style="--el:${ELEMENT_INFO[e].color}">${esc(ELEMENT_INFO[e].es)}</button>`,
  ),
].join('');

const rarities = Object.keys(NFT_SUPPLY_BY_RARITY) as Rarity[];
const supplyHtml = rarities
  .map((r) => {
    const species = CREATURES.filter((c) => c.rarity === r).length;
    return `
            <tr class="rar-row-${r}"><th scope="row"><span class="rar rar-${r}">${RARITY[r]}</span></th><td>${species}</td><td>${NFT_SUPPLY_BY_RARITY[r].toLocaleString('es-ES')}</td></tr>`;
  })
  .join('');
const total = CREATURES.reduce((n, c) => n + NFT_SUPPLY_BY_RARITY[c.rarity], 0);

const play = APP_OPEN
  ? `<a class="btn btn-play" href="${esc(APP_URL)}">¡Jugar ahora!</a>`
  : `<span class="btn btn-play soon" aria-disabled="true">Beta en Córdoba · muy pronto</span>`;

const html = readFileSync(join(OUT, 'index.html'), 'utf8')
  .replaceAll('{{PLAY}}', play)
  .replaceAll('{{COUNT}}', String(CREATURES.length))
  .replaceAll('{{ELEMENTS}}', String(ELEMENTS.length))
  .replaceAll('{{STARTERS}}', startersHtml)
  .replaceAll('{{FILTERS}}', filtersHtml)
  .replaceAll('{{CREATURES}}', creaturesHtml)
  .replaceAll('{{SUPPLY}}', supplyHtml)
  .replaceAll('{{TOTAL}}', total.toLocaleString('es-ES'))
  .replaceAll('{{YEAR}}', String(new Date().getFullYear()));
if (/\{\{[A-Z]+\}\}/.test(html)) throw new Error('unfilled placeholder in index.html');
writeFileSync(join(OUT, 'index.html'), html);
process.stdout.write(
  `site built in ${OUT}/ (${CREATURES.length} creatures, app ${APP_OPEN ? 'open' : 'coming soon'})\n`,
);
