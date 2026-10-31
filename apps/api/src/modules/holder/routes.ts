import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { RpcUnavailable, type NearRpc } from '../wallet/rpc.js';
import { rankOf, rankView, snapshotPlayer } from './ranks.js';

/** The player's test token rank (testnet), and a way to read the balance again now. */
export async function holderRoutes(
  app: FastifyInstance,
  {
    db,
    network,
    contract,
    rpc,
  }: { db: Db; network: string; contract: string | null; rpc: NearRpc },
) {
  async function view(userId: string) {
    const [rank, link] = await Promise.all([
      rankOf(db, userId, network),
      db.query<{ account_id: string }>(
        `SELECT account_id FROM wallet_links WHERE user_id = $1 AND network = $2`,
        [userId, network],
      ),
    ]);
    return { network, ...rankView(rank, contract, link.rows[0]?.account_id ?? null) };
  }

  app.get('/v1/me/holder', async (req) => view(requireAuth(req).userId));

  /** Reads the balance now instead of waiting for the hourly check. */
  app.post(
    '/v1/me/holder/refresh',
    { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } },
    async (req) => {
      const auth = requireAuth(req);
      if (!contract || !rpc.ftBalance) throw new HttpProblem('not_found', 'Holder ranks are off');
      try {
        const r = await snapshotPlayer(db, rpc, contract, network, auth.userId);
        if (r === 'not_adult') throw new HttpProblem('web3_restricted', 'Adults only');
        if (r === 'no_wallet')
          throw new HttpProblem('wallet_required', 'Link a NEAR account first');
      } catch (e) {
        if (e instanceof RpcUnavailable) {
          throw new HttpProblem('wallet_unavailable', 'NEAR could not be reached; try again later');
        }
        throw e;
      }
      return view(auth.userId);
    },
  );
}
