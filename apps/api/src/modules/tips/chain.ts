import { Account, JsonRpcProvider } from 'near-api-js';

/** The treasury on NEAR, as the tips need it. Tests pass a fake. */
export interface TipChain {
  readonly treasury: string;
  /** Available balance (yoctoNEAR), what the treasury could pay. */
  balance(): Promise<bigint>;
  /** Sends `yocto` from the treasury; resolves once final. */
  send(account: string, yocto: bigint): Promise<{ txHash: string | null }>;
}

/** No answer from NEAR: the transfer may or may not have happened. */
export class ChainNoAnswer extends Error {}
/** NEAR answered and refused: nothing was transferred. */
export class ChainRefused extends Error {}

const NO_ANSWER = /fetch failed|timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|socket|50[234]/i;
const classify = (e: unknown, what: string): Error => {
  const msg = (e as Error)?.message ?? String(e);
  return NO_ANSWER.test(msg)
    ? new ChainNoAnswer(`${what}: ${msg}`)
    : new ChainRefused(`${what}: ${msg}`);
};

/** The treasury account was created with the game account's key, so that key signs for it. */
export function nearTipChain(opts: { rpcUrl: string; treasury: string; key: string }): TipChain {
  const provider = new JsonRpcProvider({ url: opts.rpcUrl });
  const account = new Account(opts.treasury, provider, opts.key as `ed25519:${string}`);
  return {
    treasury: opts.treasury,
    async balance() {
      try {
        return (await new Account(opts.treasury, provider).getState()).balance.available;
      } catch (e) {
        throw classify(e, 'balance');
      }
    },
    async send(to, yocto) {
      try {
        const out = (await account.transfer({ receiverId: to, amount: yocto })) as {
          transaction?: { hash?: string };
        };
        return { txHash: out.transaction?.hash ?? null };
      } catch (e) {
        throw classify(e, 'transfer');
      }
    },
  };
}
