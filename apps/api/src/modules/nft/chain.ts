import { Account, JsonRpcProvider } from 'near-api-js';

/**
 * What the API needs from the creatures NFT contract. The real client talks to NEAR; tests pass
 * a fake. Errors reaching NEAR surface as ChainUnavailable.
 */
export interface TokenMetadata {
  title: string;
  description: string;
  media: string;
  copies: number;
  issued_at: string;
  /** JSON: species, element, rarity, IVs and level when it left the game. */
  extra: string;
}

export interface NftChain {
  readonly contractId: string;
  /** Mints to `owner`; resolves once the transaction is final. */
  mint(tokenId: string, owner: string, metadata: TokenMetadata): Promise<{ txHash: string | null }>;
  /** Current holder of a token, or null if it does not exist. */
  tokenOwner(tokenId: string): Promise<string | null>;
  /** Every token id an account holds in this contract. */
  tokensFor(account: string): Promise<string[]>;
}

export class ChainUnavailable extends Error {}

/** Enough to pay a token's storage; the contract refunds what is not used. */
const MINT_DEPOSIT = 100_000_000_000_000_000_000_000n; // 0.1 NEAR
const MINT_GAS = 50_000_000_000_000n; // 50 Tgas
const PAGE = 100;

export function nearNftChain(opts: {
  rpcUrl: string;
  contractId: string;
  minterAccount: string;
  minterKey: string;
}): NftChain {
  const provider = new JsonRpcProvider({ url: opts.rpcUrl });
  const minter = new Account(opts.minterAccount, provider, opts.minterKey as `ed25519:${string}`);
  const view = async <T>(method: string, args: Record<string, unknown>): Promise<T | undefined> => {
    try {
      return (await provider.callFunction({ contractId: opts.contractId, method, args })) as
        T | undefined;
    } catch (e) {
      throw new ChainUnavailable(`view ${method}: ${(e as Error).message}`);
    }
  };
  return {
    contractId: opts.contractId,
    async mint(tokenId, owner, metadata) {
      try {
        const out = (await minter.callFunctionRaw({
          contractId: opts.contractId,
          methodName: 'nft_mint',
          args: { token_id: tokenId, token_owner_id: owner, token_metadata: metadata },
          deposit: MINT_DEPOSIT,
          gas: MINT_GAS,
        })) as { transaction?: { hash?: string } };
        return { txHash: out.transaction?.hash ?? null };
      } catch (e) {
        throw new ChainUnavailable(`nft_mint: ${(e as Error).message}`);
      }
    },
    async tokenOwner(tokenId) {
      const t = await view<{ owner_id: string } | null>('nft_token', { token_id: tokenId });
      return t?.owner_id ?? null;
    },
    async tokensFor(account) {
      const ids: string[] = [];
      for (let from = 0; ; from += PAGE) {
        const page =
          (await view<{ token_id: string }[]>('nft_tokens_for_owner', {
            account_id: account,
            from_index: String(from),
            limit: PAGE,
          })) ?? [];
        ids.push(...page.map((t) => t.token_id));
        if (page.length < PAGE) return ids;
      }
    },
  };
}
