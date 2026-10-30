/** One contract call signed by the player's own wallet (NEAR Connect). */
export interface NearCall {
  network: string;
  /** The account the game linked: the wallet must sign with it. */
  signerId: string;
  receiverId: string;
  methodName: string;
  args: object;
  /** yoctoNEAR, as a decimal string. */
  deposit: string;
  /** gas units, as a decimal string. */
  gas: string;
}

/** Sends a call; resolves with the transaction hash. Swappable in tests. */
export type NearCaller = (call: NearCall) => Promise<{ txHash: string | null }>;

export class WrongAccountError extends Error {
  constructor(
    readonly expected: string,
    readonly got: string,
  ) {
    super(`signed in as ${got}, expected ${expected}`);
  }
}

/**
 * The real caller: opens the wallet selector (only now, on the player's tap), checks the wallet
 * is the linked account, and asks it to sign and send. The game never holds the player's keys.
 */
export const connectorCaller: NearCaller = async (call) => {
  const { NearConnector } = await import('@hot-labs/near-connect');
  const connector = new NearConnector({
    network: call.network as 'testnet' | 'mainnet',
    features: { signAndSendTransaction: true, [call.network]: true },
  });
  const wallet = await connector.connect();
  try {
    const accounts = await wallet.getAccounts();
    const got = accounts[0]?.accountId ?? '';
    if (got !== call.signerId) throw new WrongAccountError(call.signerId, got);
    const out = (await wallet.signAndSendTransaction({
      network: call.network as 'testnet' | 'mainnet',
      signerId: call.signerId,
      receiverId: call.receiverId,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: call.methodName,
            args: call.args,
            gas: call.gas,
            deposit: call.deposit,
          },
        },
      ],
    })) as { transaction?: { hash?: string } };
    return { txHash: out.transaction?.hash ?? null };
  } finally {
    void connector.disconnect(wallet).catch(() => undefined);
  }
};

const YOCTO = 10n ** 24n;

/** "1.5" NEAR → yoctoNEAR string; null if not a positive amount with at most 6 decimals. */
export function nearToYocto(text: string): string | null {
  const m = /^\s*(\d+)(?:[.,](\d{1,6}))?\s*$/.exec(text);
  if (!m) return null;
  const v = BigInt(m[1]!) * YOCTO + BigInt((m[2] ?? '').padEnd(6, '0')) * 10n ** 18n;
  return v > 0n ? v.toString() : null;
}

/** yoctoNEAR string → "1.5" (up to 4 decimals). */
export function yoctoToNear(yocto: string): string {
  const micro = BigInt(yocto) / 10n ** 20n; // 4 decimals
  const whole = micro / 10_000n;
  const frac = (micro % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
