/**
 * Deploys the NYRGO token to NEAR testnet (src/modules/nft/deploy.ts → deployToken). Safe to run
 * again. Run by the "Deploy token (testnet)" workflow; locally:
 *
 *   NEAR_GAME_ACCOUNT=nyrgo.testnet NEAR_GAME_KEY=ed25519:… \
 *     pnpm --filter @nyrgo/api token:deploy -- --wasm ../../contracts/token/target/near/nyrgo_token.wasm [--dry-run]
 *
 * The key is read from the environment only and never printed.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { deployToken, nearDeployTarget } from '../src/modules/nft/deploy.js';

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
const contract = process.env.NEAR_TOKEN_CONTRACT || `token.${game}`;

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}
if (!game.endsWith('.testnet'))
  fail('NEAR_GAME_ACCOUNT must be a .testnet account (mainnet is closed until Phase 6)');
if (/mainnet/i.test(rpc)) fail('NEAR_RPC_URL points at mainnet; this deploy is testnet only');
if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(key))
  fail("NEAR_GAME_KEY must be the game account's ed25519 secret key");
if (!values.wasm) fail('--wasm <path to nyrgo_token.wasm> is required');

const lines: string[] = [];
const r = await deployToken(nearDeployTarget(rpc, game, key), {
  game,
  contract,
  wasm: readFileSync(values.wasm),
  upgrade: values.upgrade,
  dryRun: values['dry-run'],
  log: (l) => {
    lines.push(l);
    process.stdout.write(`${l}\n`);
  },
});
process.stdout.write(
  `\ntoken ${contract} (${r.deployed}${r.created ? ', account created' : ''})\nAPI: NEAR_TOKEN_CONTRACT=${contract}\n`,
);
if (process.env.GITHUB_ACTIONS) {
  for (const l of [
    ...lines,
    `token ${contract}: ${r.deployed}${values['dry-run'] ? ' (dry run)' : ''}`,
  ]) {
    process.stdout.write(`::notice title=Token deploy::${l}\n`);
  }
}
