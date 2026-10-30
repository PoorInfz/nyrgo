/**
 * Deploys the creatures NFT contract to NEAR testnet and registers every species (see
 * src/modules/nft/deploy.ts). Safe to run again: it only does what is missing. Run by the
 * "Deploy NFT contract (testnet)" workflow; locally:
 *
 *   NEAR_GAME_ACCOUNT=nyrgo-game.testnet NEAR_GAME_KEY=ed25519:… \
 *     pnpm --filter @nyrgo/api nft:deploy -- --wasm ../../contracts/creatures/target/near/nyrgo_creatures.wasm [--dry-run] [--upgrade]
 *
 * The key is read from the environment only and never printed.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CREATURES, NFT_SUPPLY_BY_RARITY } from '@nyrgo/shared';
import { deployCreatures, nearDeployTarget } from '../src/modules/nft/deploy.js';

const { values } = parseArgs({
  options: {
    wasm: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    upgrade: { type: 'boolean', default: false },
  },
});

const rpc = process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
const game = process.env.NEAR_GAME_ACCOUNT ?? '';
const key = process.env.NEAR_GAME_KEY ?? '';
const contract = process.env.NEAR_NFT_CONTRACT || `creatures.${game}`;

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}
if (!game.endsWith('.testnet'))
  fail('NEAR_GAME_ACCOUNT must be a .testnet account (mainnet is closed until Phase 6)');
if (/mainnet/i.test(rpc)) fail('NEAR_RPC_URL points at mainnet; this deploy is testnet only');
if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(key))
  fail("NEAR_GAME_KEY must be the game account's ed25519 secret key (ed25519:…)");
if (!values.wasm) fail('--wasm <path to nyrgo_creatures.wasm> is required');

const species = CREATURES.map((c) => ({
  species: c.id,
  max_supply: NFT_SUPPLY_BY_RARITY[c.rarity],
}));
const lines: string[] = [];
const report = await deployCreatures(nearDeployTarget(rpc, game, key), {
  game,
  contract,
  wasm: readFileSync(values.wasm),
  species,
  upgrade: values.upgrade,
  dryRun: values['dry-run'],
  log: (l) => {
    lines.push(l);
    process.stdout.write(`${l}\n`);
  },
});

process.stdout.write(
  [
    '',
    `contract   ${contract} (${report.deployed}${report.created ? ', account created' : ''})`,
    `species    ${report.registered} registered now, ${report.alreadyRegistered} before`,
    `explorer   https://testnet.nearblocks.io/address/${contract}`,
    '',
    'API environment:',
    `  NEAR_NETWORK=testnet`,
    `  NEAR_NFT_CONTRACT=${contract}`,
    `  NEAR_MINTER_ACCOUNT=${game}`,
    `  NEAR_MINTER_KEY=<the same key as NEAR_GAME_KEY>`,
    '',
  ].join('\n'),
);
// in GitHub Actions, also as annotations: readable from the run page and the API without the log
if (process.env.GITHUB_ACTIONS) {
  const notice = (m: string) => process.stdout.write(`::notice title=NFT deploy::${m}\n`);
  notice(
    `${contract}: ${report.deployed}${report.created ? ', account created' : ''}; ` +
      `species registered now ${report.registered}, before ${report.alreadyRegistered}` +
      `${values['dry-run'] ? ' (dry run)' : ''}`,
  );
  for (const l of lines) notice(l);
  if (report.mismatched.length) {
    process.stdout.write(
      `::warning title=NFT deploy::supply differs: ${report.mismatched.join(', ')}\n`,
    );
  }
}
if (report.mismatched.length) process.exit(2);
