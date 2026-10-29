import { Account, JsonRpcProvider } from 'near-api-js';

/**
 * What the API needs from the creatures NFT contract. The real client talks to NEAR; tests pass
 * a fake. Errors reaching NEAR surface as ChainUnavailable.
 */
export interface TokenMetadata {
  /** The species name; the contract appends the edition ("Gwisp #12/1000"). */
  title: string;
  description: string;
  /** The card image (PNG) the API draws for this token. */
  media: string;
  /** JSON with the attributes marketplaces show (NEP-177 `reference`). */
  reference: string;
  issued_at: string;
  /** JSON: species, element, rarity, IVs, stats, grade and level when it left the game. */
  extra: string;
}

export interface TokenView {
  owner: string;
  title: string | null;
}

/** "Gwisp #12/1000" → edition 12 of 1000. */
export function editionOf(title: string | null): { edition: number; supply: number } | null {
  const m = title ? /#(\d+)\/(\d+)$/.exec(title) : null;
  return m ? { edition: Number(m[1]), supply: Number(m[2]) } : null;
}

export interface NftChain {
  readonly contractId: string;
  /** Mints the next edition of `species` to `owner`; resolves once the transaction is final. */
  mint(
    tokenId: string,
    owner: string,
    species: string,
    metadata: TokenMetadata,
  ): Promise<{ txHash: string | null }>;
  /** A token's holder and title, or null if it does not exist. */
  token(tokenId: string): Promise<TokenView | null>;
  /** How many of a species exist and can exist; null if the species is not registered. */
  speciesSupply(species: string): Promise<{ minted: number; max: number } | null>;
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
    async mint(tokenId, owner, species, metadata) {
      try {
        const out = (await minter.callFunctionRaw({
          contractId: opts.contractId,
          methodName: 'nft_mint',
          args: { token_id: tokenId, token_owner_id: owner, species, token_metadata: metadata },
          deposit: MINT_DEPOSIT,
          gas: MINT_GAS,
        })) as { transaction?: { hash?: string } };
        return { txHash: out.transaction?.hash ?? null };
      } catch (e) {
        throw new ChainUnavailable(`nft_mint: ${(e as Error).message}`);
      }
    },
    async token(tokenId) {
      const t = await view<{ owner_id: string; metadata?: { title?: string | null } } | null>(
        'nft_token',
        { token_id: tokenId },
      );
      return t ? { owner: t.owner_id, title: t.metadata?.title ?? null } : null;
    },
    async speciesSupply(species) {
      return (
        (await view<{ minted: number; max: number } | null>('species_supply', { species })) ?? null
      );
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
