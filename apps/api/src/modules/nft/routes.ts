import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { canUseWeb3, nftGrade, type AgeBand } from '@nyrgo/shared';
import type { AppConfig } from '../../config.js';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { listOwned, loadOwned } from '../creatures/owned.js';
import { renderCard } from './card.js';
import { ChainUnavailable, editionOf, type NftChain, type TokenView } from './chain.js';
import { creatureMetadata, referenceJson, type NftSnapshot } from './service.js';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A mint that started this long ago and never finished is picked up again. */
const STUCK_MS = 2 * 60_000;
/** The market is read from the chain at most this often. */
const MARKET_CACHE_MS = 10_000;

/**
 * Taking a creature out of the game as an NFT (Phase 3, testnet). The game account mints the
 * token to the player's linked NEAR account; from then on the creature belongs to whoever holds
 * the token. Adults with a linked wallet only.
 */
export async function nftRoutes(
  app: FastifyInstance,
  { db, config, chain }: { db: Db; config: AppConfig; chain: NftChain },
) {
  const network = config.near.network;
  const urls = (id: string) => ({
    card: `${config.publicApiUrl}/v1/nft/cards/${id}.png`,
    reference: `${config.publicApiUrl}/v1/nft/tokens/${id}.json`,
  });
  /** Cards are fixed per token: keep the last few drawn in memory. */
  const cards = new Map<string, Buffer>();

  app.get('/v1/nft', async () => ({ contractId: chain.contractId, network }));

  /**
   * The game's market: creatures for sale, read from the contract (cached a few seconds) and
   * described from what the game knows of each token. Buying and selling are signed by the
   * players' own wallets; the API only shows.
   */
  let market: { at: number; body: unknown } | null = null;
  app.get('/v1/market', async (req) => {
    if (market && Date.now() - market.at < MARKET_CACHE_MS) return market.body;
    let listings: { token_id: string; seller: string; price: string }[];
    let cfg: { treasury: string; royalty_bps: number; market_fee_bps: number };
    try {
      [listings, cfg] = await Promise.all([chain.listings(), chain.marketConfig()]);
    } catch (e) {
      if (!(e instanceof ChainUnavailable)) throw e;
      req.log.warn({ err: e.message }, 'market read failed');
      throw new HttpProblem('nft_unavailable', 'NEAR could not be reached; try again');
    }
    const ids = listings.map((l) => l.token_id).filter((id) => UUID.test(id));
    const { rows } = await db.query<{
      id: string;
      nft_snapshot: NftSnapshot;
      nft_edition: number | null;
      nft_supply: number | null;
    }>(
      `SELECT id, nft_snapshot, nft_edition, nft_supply FROM creature_instances
        WHERE id = ANY($1::uuid[]) AND nft_snapshot IS NOT NULL`,
      [ids],
    );
    const known = new Map(rows.map((r) => [r.id, r]));
    const body = {
      contractId: chain.contractId,
      network,
      treasury: cfg.treasury,
      marketFeeBps: cfg.market_fee_bps,
      royaltyBps: cfg.royalty_bps,
      listings: listings
        .filter((l) => known.has(l.token_id))
        .map((l) => {
          const t = known.get(l.token_id)!;
          return {
            tokenId: l.token_id,
            seller: l.seller,
            priceYocto: l.price,
            species: t.nft_snapshot.species,
            level: t.nft_snapshot.level,
            grade: nftGrade(t.nft_snapshot.ivs),
            edition: t.nft_edition,
            supply: t.nft_supply,
            cardUrl: urls(l.token_id).card,
          };
        }),
    };
    market = { at: Date.now(), body };
    return body;
  });

  /** A minted token's snapshot and edition; null for anything else (never unminted creatures). */
  async function minted(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await db.query<{
      nft_snapshot: NftSnapshot;
      nft_edition: number | null;
      nft_supply: number | null;
    }>(
      `SELECT nft_snapshot, nft_edition, nft_supply FROM creature_instances
        WHERE id = $1 AND onchain_status = 'minted' AND nft_snapshot IS NOT NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** The card image a token shows (NEP-177 `media`). Public, like everything on chain. */
  app.get<{ Params: { file: string } }>('/v1/nft/cards/:file', async (req, reply) => {
    const id = req.params.file.replace(/\.png$/, '');
    let png = cards.get(id);
    if (!png) {
      const t = await minted(id);
      if (!t) throw new HttpProblem('not_found', 'No such token');
      png = await renderCard(config.nftArtDir, {
        ...t.nft_snapshot,
        edition: t.nft_edition,
        supply: t.nft_supply,
      });
      cards.set(id, png);
      if (cards.size > 200) cards.delete(cards.keys().next().value!);
    }
    return reply
      .header('content-type', 'image/png')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(png);
  });

  /** The token's attributes for marketplaces (NEP-177 `reference`). */
  app.get<{ Params: { file: string } }>('/v1/nft/tokens/:file', async (req, reply) => {
    const id = req.params.file.replace(/\.json$/, '');
    const t = await minted(id);
    if (!t) throw new HttpProblem('not_found', 'No such token');
    const ed =
      t.nft_edition && t.nft_supply ? { edition: t.nft_edition, supply: t.nft_supply } : null;
    return reply
      .header('cache-control', 'public, max-age=3600')
      .send(referenceJson({ card: urls(id).card }, t.nft_snapshot, ed));
  });

  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/me/creatures/:id/mint',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      const { rows: who } = await db.query<{ age_band: AgeBand; account_id: string | null }>(
        `SELECT u.age_band, w.account_id FROM users u
           LEFT JOIN wallet_links w ON w.user_id = u.id AND w.network = $2
          WHERE u.id = $1`,
        [auth.userId, network],
      );
      if (!who[0] || !canUseWeb3(who[0].age_band)) {
        throw new HttpProblem('web3_restricted', 'NFTs are for players aged 18 or over');
      }
      const account = who[0].account_id;
      if (!account) throw new HttpProblem('wallet_required', 'Link a NEAR account first');

      // 1. Lock the creature for the mint, so it cannot evolve or be minted twice meanwhile.
      const creature = await withTx(db, async (c) => {
        const mine = await loadOwned(c, auth.userId, req.params.id);
        if (!mine) throw new HttpProblem('not_found', 'Unknown creature');
        if (mine.onchain?.status === 'minted') {
          throw new HttpProblem('creature_onchain', 'This creature is already an NFT');
        }
        const fighting = await c.query(
          `SELECT 1 FROM battles WHERE instance_id = $1 AND result IS NULL`,
          [mine.id],
        );
        if (fighting.rowCount) throw new HttpProblem('battle_active', 'It is in a battle');
        const { rows } = await c.query<{ started: Date | null }>(
          `SELECT onchain_checked_at AS started FROM creature_instances WHERE id = $1`,
          [mine.id],
        );
        const started = rows[0]?.started;
        if (
          mine.onchain?.status === 'minting' &&
          started &&
          Date.now() - started.getTime() < STUCK_MS
        ) {
          throw new HttpProblem('conflict', 'It is already on its way to your wallet');
        }
        await c.query(
          `UPDATE creature_instances SET onchain_status = 'minting', onchain_checked_at = now()
            WHERE id = $1`,
          [mine.id],
        );
        return mine;
      });

      // 2. Mint, unless an earlier attempt already did (it may have timed out after succeeding).
      const snapshot: NftSnapshot = {
        species: creature.creatureId,
        level: creature.level,
        ivs: creature.ivs,
      };
      const release = () =>
        db.query(
          `UPDATE creature_instances SET onchain_status = NULL WHERE id = $1 AND onchain_status = 'minting'`,
          [creature.id],
        );
      let token: TokenView | null;
      let txHash: string | null = null;
      try {
        token = await chain.token(creature.id);
        if (!token) {
          // every species has a fixed supply on chain: check before spending a transaction
          const supply = await chain.speciesSupply(snapshot.species);
          if (!supply) throw new ChainUnavailable(`species ${snapshot.species} is not registered`);
          if (supply.minted >= supply.max) {
            await release();
            throw new HttpProblem(
              'nft_sold_out',
              `All ${supply.max} editions of this species already exist`,
            );
          }
          txHash = (
            await chain.mint(
              creature.id,
              account,
              snapshot.species,
              creatureMetadata(urls(creature.id), { ...snapshot, caughtAt: creature.acquiredAt }),
            )
          ).txHash;
          token = (await chain.token(creature.id)) ?? { owner: account, title: null };
        }
      } catch (e) {
        if (!(e instanceof ChainUnavailable)) throw e;
        req.log.warn({ err: e.message }, 'nft mint failed');
        await release();
        throw new HttpProblem('nft_unavailable', 'NEAR could not be reached; try again');
      }

      // 3. Record it. The creature now belongs to whoever holds the token.
      const ed = editionOf(token.title);
      await db.query(
        `UPDATE creature_instances
            SET onchain_status = 'minted', onchain_owner = $2, minted_at = now(), mint_tx = $3,
                onchain_checked_at = now(), nft_edition = $4, nft_supply = $5, nft_snapshot = $6
          WHERE id = $1`,
        [creature.id, token.owner, txHash, ed?.edition ?? null, ed?.supply ?? null, snapshot],
      );
      const after = (await listOwned(db, auth.userId)).find((c) => c.id === creature.id) ?? null;
      return { creature: after, txHash, contractId: chain.contractId };
    },
  );
}
