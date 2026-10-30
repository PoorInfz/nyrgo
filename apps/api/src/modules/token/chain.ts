import { Account, JsonRpcProvider } from 'near-api-js';

/** What the API needs from the NYRGO contract. Tests pass a fake. */
export interface FtChain {
  readonly contractId: string;
  /** Whether an account can receive the token (NEP-145 storage registered). */
  isRegistered(account: string): Promise<boolean>;
  /** Registers an account, the game paying its storage. */
  register(account: string): Promise<void>;
  /** Sends `amount` whole NYRGO from the game account; resolves once final. */
  transfer(account: string, amount: number, memo: string): Promise<{ txHash: string | null }>;
}

/** No answer from NEAR: the transfer may or may not have happened. */
export class ChainNoAnswer extends Error {}
/** NEAR answered and refused: nothing was transferred. */
export class ChainRefused extends Error {}

const DECIMALS = 10n ** 18n;
const ONE_YOCTO = 1n;
/** NEP-145 minimum for a plain FT account is 0.00125 NEAR; extra is refunded. */
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n;
const GAS = 30_000_000_000_000n;

const NO_ANSWER =
  /fetch failed|timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|socket|503|502|504/i;

function classify(e: unknown, what: string): Error {
  const msg = (e as Error)?.message ?? String(e);
  return NO_ANSWER.test(msg)
    ? new ChainNoAnswer(`${what}: ${msg}`)
    : new ChainRefused(`${what}: ${msg}`);
}

export function nearFtChain(opts: {
  rpcUrl: string;
  contractId: string;
  minterAccount: string;
  minterKey: string;
}): FtChain {
  const provider = new JsonRpcProvider({ url: opts.rpcUrl });
  const game = new Account(opts.minterAccount, provider, opts.minterKey as `ed25519:${string}`);
  return {
    contractId: opts.contractId,
    async isRegistered(account) {
      try {
        const b = await provider.callFunction({
          contractId: opts.contractId,
          method: 'storage_balance_of',
          args: { account_id: account },
        });
        return b !== null && b !== undefined;
      } catch (e) {
        throw classify(e, 'storage_balance_of');
      }
    },
    async register(account) {
      try {
        await game.callFunctionRaw({
          contractId: opts.contractId,
          methodName: 'storage_deposit',
          args: { account_id: account, registration_only: true },
          deposit: STORAGE_DEPOSIT,
          gas: GAS,
        });
      } catch (e) {
        throw classify(e, 'storage_deposit');
      }
    },
    async transfer(account, amount, memo) {
      try {
        const out = (await game.callFunctionRaw({
          contractId: opts.contractId,
          methodName: 'ft_transfer',
          args: { receiver_id: account, amount: (BigInt(amount) * DECIMALS).toString(), memo },
          deposit: ONE_YOCTO,
          gas: GAS,
        })) as { transaction?: { hash?: string } };
        return { txHash: out.transaction?.hash ?? null };
      } catch (e) {
        throw classify(e, 'ft_transfer');
      }
    },
  };
}
