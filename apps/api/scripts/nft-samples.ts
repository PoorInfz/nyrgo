/**
 * Draws example NFT cards into docs/nft/ so the collection can be reviewed without minting:
 * one species from its worst grade to its best, one creature of each rarity, and every species
 * (all.webp) to check that each portrait sits well in its frame.
 *   pnpm --filter @nyrgo/api nft:samples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { CREATURES, NFT_SUPPLY_BY_RARITY, CREATURES_BY_ID } from '@nyrgo/shared';
import { renderCard, type CardData } from '../src/modules/nft/card.js';

const ART = '../web/public';
const OUT = '../../docs/nft';
const iv = (hp: number, atk: number, def: number, spd: number) => ({ hp, atk, def, spd });
const card = (species: string, level: number, ivs: CardData['ivs'], edition: number): CardData => ({
  species,
  level,
  ivs,
  edition,
  supply: NFT_SUPPLY_BY_RARITY[CREATURES_BY_ID.get(species)!.rarity],
});

const rows: [string, CardData[]][] = [
  [
    'grades',
    [
      card('dropling', 6, iv(3, 2, 5, 4), 911),
      card('dropling', 6, iv(6, 5, 7, 6), 512),
      card('dropling', 6, iv(9, 8, 8, 9), 288),
      card('dropling', 6, iv(12, 11, 10, 12), 64),
      card('dropling', 6, iv(15, 14, 13, 15), 3),
    ],
  ],
  [
    'rarities',
    [
      card('burnlet', 8, iv(8, 9, 7, 8), 402),
      card('blockgolem', 16, iv(10, 9, 11, 8), 133),
      card('airdragon', 28, iv(11, 12, 10, 13), 58),
      card('leviawhale', 32, iv(13, 12, 12, 14), 11),
      card('genesaur', 35, iv(14, 13, 14, 12), 4),
      card('zeroknowl', 35, iv(15, 15, 14, 15), 1),
    ],
  ],
];

mkdirSync(OUT, { recursive: true });
for (const [name, cards] of rows) {
  const pngs = await Promise.all(cards.map((c) => renderCard(ART, c)));
  pngs.forEach((png, i) => writeFileSync(`${OUT}/${name}-${i + 1}-${cards[i]!.species}.png`, png));
  // a strip of the row at half size for the README
  const w = 300;
  const strip = await sharp({
    create: { width: (w + 16) * pngs.length, height: 440, channels: 4, background: '#e2f8ff' },
  })
    .composite(
      await Promise.all(
        pngs.map(async (png, i) => ({
          input: await sharp(png).resize(w).toBuffer(),
          left: i * (w + 16) + 8,
          top: 0,
        })),
      ),
    )
    .webp({ quality: 82 })
    .toBuffer();
  writeFileSync(`${OUT}/${name}.webp`, strip);
}
// every species, small, to check the framing of each portrait
{
  const pngs = await Promise.all(
    CREATURES.map((c) => renderCard(ART, card(c.id, 10, iv(8, 8, 8, 8), 1))),
  );
  const w = 200;
  const h = 293;
  const cols = 10;
  const sheet = await sharp({
    create: {
      width: w * cols,
      height: h * Math.ceil(pngs.length / cols),
      channels: 4,
      background: '#e2f8ff',
    },
  })
    .composite(
      await Promise.all(
        pngs.map(async (png, i) => ({
          input: await sharp(png).resize(w, h).toBuffer(),
          left: (i % cols) * w,
          top: Math.floor(i / cols) * h,
        })),
      ),
    )
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(`${OUT}/all.webp`, sheet);
}
process.stdout.write(`cards written to ${OUT}\n`);
