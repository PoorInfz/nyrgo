/**
 * Deploys the nyrGo! test token to NEAR testnet (see src/modules/token/deploy.ts) and, if asked,
 * sends test tokens from the game account. Run by the "Deploy test token (testnet)" workflow;
 * locally:
 *
 *   NEAR_GAME_ACCOUNT=nyrgo-game.testnet NEAR_GAME_KEY=ed25519:… \
 *     pnpm --filter @nyrgo/api token:deploy -- --wasm ../../contracts/token/target/near/nyrgo_token.wasm \
 *       [--send alice.testnet=5000000,bob.testnet=1000000] [--dry-run]
 *
 * The key is read from the environment only and never printed.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { deployToken, nearTokenTarget } from '../src/modules/token/deploy.js';

const { values } = parseArgs({
  options: {
    wasm: { type: 'string' },
    send: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
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
  fail("NEAR_GAME_KEY must be the game account's ed25519 secret key (ed25519:…)");
if (!values.wasm) fail('--wasm <path to nyrgo_token.wasm> is required');

const sends: [string, number][] = [];
for (const part of values.send
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)) {
  const m = /^([a-z0-9._-]{2,64}\.testnet)=(\d{1,12})$/.exec(part);
  if (!m) fail(`--send entries look like name.testnet=amount (got "${part}")`);
  sends.push([m[1]!, Number(m[2])]);
}

const lines: string[] = [];
const report = await deployToken(nearTokenTarget(rpc, game, key), {
  game,
  contract,
  wasm: readFileSync(values.wasm),
  sends,
  dryRun: values['dry-run'],
  log: (l) => {
    lines.push(l);
    process.stdout.write(`${l}\n`);
  },
});
process.stdout.write(
  `\ntoken      ${contract} (${report.deployed}${report.created ? ', account created' : ''}); ${report.sent} transfers\n` +
    `explorer   https://testnet.nearblocks.io/address/${contract}\n`,
);
if (process.env.GITHUB_ACTIONS) {
  for (const l of lines) process.stdout.write(`::notice title=Token deploy::${l}\n`);
}
