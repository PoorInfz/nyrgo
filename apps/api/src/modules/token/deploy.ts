import { Account, JsonRpcProvider, KeyPair, actions, type KeyPairString } from 'near-api-js';
import { TOKEN, TOKEN_UNIT } from '@nyrgo/shared';
import { codeHashOf, near } from '../nft/deploy.js';

/**
 * Puts the nyrGo! test token on NEAR testnet, safe to run again:
 *
 *   1. `token.<game>` is created by the game account, with the game's key
 *   2. the contract is deployed and initialised: the whole supply goes to the game account
 *   3. optionally, test tokens are sent from the game account to accounts given on the command
 *      line (registering them with the token first), so ranks can be tried
 *
 * Testnet only; the key never leaves the process and is never printed.
 */

export interface TokenTarget {
  account(id: string): Promise<{ available: bigint; codeHash: string } | null>;
  createContractAccount(id: string, deposit: bigint): Promise<void>;
  deploy(id: string, wasm: Uint8Array, init: Record<string, unknown>): Promise<void>;
  view<T>(id: string, method: string, args: Record<string, unknown>): Promise<T>;
  /** From the game account: register `to` with the token if needed, then transfer. */
  send(contract: string, to: string, amount: bigint): Promise<void>;
}

const NEAR = 10n ** 24n;
const EMPTY_CODE = '11111111111111111111111111111111';
/** Storage for a ~200 kB token contract and its first holders. */
export const TOKEN_DEPOSIT = 3n * NEAR;

export const METADATA = {
  spec: 'ft-1.0.0',
  name: 'nyrGo! (testnet, no value)',
  symbol: TOKEN.symbol,
  icon: null,
  reference: null,
  reference_hash: null,
  decimals: TOKEN.decimals,
};

export interface TokenDeployOptions {
  game: string;
  contract: string;
  wasm: Uint8Array;
  /** account → whole tokens to send from the game account. */
  sends?: [string, number][];
  dryRun?: boolean;
  log?: (line: string) => void;
}

export async function deployToken(t: TokenTarget, o: TokenDeployOptions) {
  const log = o.log ?? (() => {});
  const would = o.dryRun ? '(dry run) would ' : '';
  if (!o.contract.endsWith(`.${o.game}`)) {
    throw new Error(`The token account must be a sub-account of ${o.game}`);
  }
  const game = await t.account(o.game);
  if (!game) throw new Error(`The game account ${o.game} does not exist on this network`);
  log(`game account ${o.game}: ${near(game.available)} available`);

  let acc = await t.account(o.contract);
  let created = false;
  if (!acc) {
    if (game.available < TOKEN_DEPOSIT + NEAR) {
      throw new Error(
        `${o.game} needs at least ${near(TOKEN_DEPOSIT + NEAR)} to create the token account; top it up from the testnet faucet`,
      );
    }
    log(`${would}create ${o.contract} with ${near(TOKEN_DEPOSIT)}`);
    if (!o.dryRun) {
      await t.createContractAccount(o.contract, TOKEN_DEPOSIT);
      acc = await t.account(o.contract);
    }
    created = true;
  }

  let deployed: 'new' | 'unchanged' | 'differs' = 'unchanged';
  const hash = codeHashOf(o.wasm);
  const onChain = acc?.codeHash ?? EMPTY_CODE;
  if (onChain === EMPTY_CODE) {
    log(
      `${would}deploy and mint ${TOKEN.supply.toLocaleString('en')} ${TOKEN.symbol} to ${o.game}`,
    );
    if (!o.dryRun) {
      await t.deploy(o.contract, o.wasm, {
        owner_id: o.game,
        total_supply: (BigInt(TOKEN.supply) * TOKEN_UNIT).toString(),
        metadata: METADATA,
      });
    }
    deployed = 'new';
  } else if (onChain !== hash) {
    log(`token code differs from this build (${onChain} on chain); it is left as it is`);
    deployed = 'differs';
  } else {
    log('token code is up to date');
  }

  if (o.dryRun && deployed === 'new') {
    for (const [to, n] of o.sends ?? []) log(`(dry run) would send ${n} ${TOKEN.symbol} to ${to}`);
    return { created, deployed, sent: 0 };
  }
  const meta = await t.view<{ symbol: string }>(o.contract, 'ft_metadata', {});
  if (meta.symbol !== TOKEN.symbol) throw new Error(`${o.contract} is not the nyrGo! token`);
  const supply = await t.view<string>(o.contract, 'ft_total_supply', {});
  const own = await t.view<string>(o.contract, 'ft_balance_of', { account_id: o.game });
  log(
    `supply ${(BigInt(supply) / TOKEN_UNIT).toLocaleString('en')}, game account holds ${(BigInt(own) / TOKEN_UNIT).toLocaleString('en')}`,
  );

  let sent = 0;
  for (const [to, n] of o.sends ?? []) {
    if (!(await t.account(to))) {
      log(`skip ${to}: no such account`);
      continue;
    }
    log(`${would}send ${n.toLocaleString('en')} ${TOKEN.symbol} to ${to}`);
    if (!o.dryRun) {
      await t.send(o.contract, to, BigInt(n) * TOKEN_UNIT);
      sent++;
    }
  }
  return { created, deployed, sent };
}

const notFound = (e: unknown) =>
  /does not exist|doesn't exist|UNKNOWN_ACCOUNT|AccountDoesNotExist/i.test(
    String((e as Error)?.message ?? e),
  );

export function nearTokenTarget(rpcUrl: string, game: string, key: string): TokenTarget {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const keyPair = KeyPair.fromString(key as KeyPairString);
  const gameAccount = new Account(game, provider, key as KeyPairString);
  return {
    async account(id) {
      try {
        const s = await new Account(id, provider).getState();
        return { available: s.balance.available, codeHash: s.codeHash };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async createContractAccount(id, deposit) {
      await gameAccount.createAccount({
        newAccountId: id,
        publicKey: keyPair.getPublicKey(),
        nearToTransfer: deposit,
      });
    },
    async deploy(id, wasm, init) {
      await new Account(id, provider, key as KeyPairString).signAndSendTransaction({
        receiverId: id,
        actions: [
          actions.deployContract(wasm),
          actions.functionCall('new', init, 100_000_000_000_000n, 0n),
        ],
      });
    },
    async view<T>(id: string, method: string, args: Record<string, unknown>) {
      return (await provider.callFunction({ contractId: id, method, args })) as T;
    },
    async send(contract, to, amount) {
      const registered = await provider.callFunction({
        contractId: contract,
        method: 'storage_balance_of',
        args: { account_id: to },
      });
      const list = [];
      if (!registered) {
        list.push(
          actions.functionCall(
            'storage_deposit',
            { account_id: to, registration_only: true },
            30_000_000_000_000n,
            NEAR / 100n, // 0.01 NEAR covers the registration; the rest is refunded
          ),
        );
      }
      list.push(
        actions.functionCall(
          'ft_transfer',
          { receiver_id: to, amount: amount.toString(), memo: 'nyrGo! test tokens (testnet)' },
          30_000_000_000_000n,
          1n,
        ),
      );
      await gameAccount.signAndSendTransaction({ receiverId: contract, actions: list });
    },
  };
}
