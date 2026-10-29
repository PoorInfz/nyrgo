import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { canUseWeb3, type AgeBand } from '@nyrgo/shared';
import type { AppConfig } from '../../config.js';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { listOwned, loadOwned } from '../creatures/owned.js';
import { ChainUnavailable, type NftChain } from './chain.js';
import { creatureMetadata } from './service.js';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

/** A mint that started this long ago and never finished is picked up again. */
const STUCK_MS = 2 * 60_000;

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

  app.get('/v1/nft', async () => ({ contractId: chain.contractId, network }));

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
      let holder: string;
      let txHash: string | null = null;
      try {
        const existing = await chain.tokenOwner(creature.id);
        if (existing) {
          holder = existing;
        } else {
          txHash = (
            await chain.mint(creature.id, account, creatureMetadata(config.appUrl, creature))
          ).txHash;
          holder = account;
        }
      } catch (e) {
        if (!(e instanceof ChainUnavailable)) throw e;
        req.log.warn({ err: e.message }, 'nft mint failed');
        await db.query(
          `UPDATE creature_instances SET onchain_status = NULL WHERE id = $1 AND onchain_status = 'minting'`,
          [creature.id],
        );
        throw new HttpProblem('nft_unavailable', 'NEAR could not be reached; try again');
      }

      // 3. Record it. The creature now belongs to whoever holds the token.
      await db.query(
        `UPDATE creature_instances
            SET onchain_status = 'minted', onchain_owner = $2, minted_at = now(), mint_tx = $3,
                onchain_checked_at = now()
          WHERE id = $1`,
        [creature.id, holder, txHash],
      );
      const after = (await listOwned(db, auth.userId)).find((c) => c.id === creature.id) ?? null;
      return { creature: after, txHash, contractId: chain.contractId };
    },
  );
}
