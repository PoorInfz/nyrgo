/**
 * Tops up a testnet account when the web faucets fail. Creates a throwaway account through the
 * faucet service that near-cli uses (which funds new accounts), then deletes it with `to` as
 * beneficiary, so its whole balance lands there. The throwaway key lives only in this process.
 * Testnet only. Run by the "Fund testnet account" workflow (needs near-cli-rs on PATH):
 *
 *   pnpm --filter @nyrgo/api testnet:fund -- --to nyrgo-game.testnet [--rounds 2]
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Account, JsonRpcProvider, KeyPair } from 'near-api-js';

const { values } = parseArgs({
  options: { to: { type: 'string' }, rounds: { type: 'string', default: '1' } },
});
const to = values.to ?? '';
const rounds = Math.min(5, Math.max(1, Number(values.rounds) || 1));
if (!/^[a-z0-9._-]+\.testnet$/.test(to)) {
  process.stderr.write('--to must be a .testnet account\n');
  process.exit(1);
}
const provider = new JsonRpcProvider({
  url: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
});
const near = (y: bigint) => `${(Number(y / 10n ** 21n) / 1000).toFixed(3)} NEAR`;
const balance = async (id: string) => (await new Account(id, provider).getState()).balance.total;

const before = await balance(to).catch((e: Error) => {
  const missing = /does not exist|doesn't exist|UNKNOWN_ACCOUNT/i.test(e.message);
  process.stderr.write(
    missing ? `${to} does not exist on testnet; create it in a wallet first\n` : `${e.message}\n`,
  );
  process.exit(1);
});
process.stdout.write(`${to}: ${near(before)}\n`);

for (let i = 1; i <= rounds; i++) {
  const key = KeyPair.fromRandom('ed25519');
  const temp = `nyrgo-fund-${randomBytes(6).toString('hex')}.testnet`;
  process.stdout.write(`round ${i}: creating ${temp} through the faucet service\n`);
  execFileSync(
    'near',
    [
      'account',
      'create-account',
      'sponsor-by-faucet-service',
      temp,
      'use-manually-provided-public-key',
      key.getPublicKey().toString(),
      'network-config',
      'testnet',
      'create',
    ],
    { stdio: 'inherit' },
  );
  // the account appears a moment after the faucet answers
  let got = 0n;
  for (let t = 0; t < 20 && !got; t++) {
    got = await balance(temp).catch(() => 0n);
    if (!got) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!got) throw new Error(`${temp} was not created`);
  process.stdout.write(`round ${i}: ${temp} got ${near(got)}, sending it to ${to}\n`);
  await new Account(temp, provider, key.toString()).deleteAccount(to);
}

const after = await balance(to);
process.stdout.write(`${to}: ${near(after)} (+${near(after - before)})\n`);
