import { canUseWeb3, type AgeBand } from '@nyrgo/shared';
import type { PoolClient } from 'pg';
import type { Db } from '../../db.js';

export interface Profile {
  id: string;
  kind: 'guest' | 'registered';
  email: string | null;
  ageBand: AgeBand;
  region: string | null;
  displayName: string;
  level: number;
  xp: number;
  gold: number;
  canUseWeb3: boolean;
  createdAt: string;
}

export async function loadProfile(q: Db | PoolClient, userId: string): Promise<Profile | null> {
  const { rows } = await q.query<{
    id: string;
    kind: 'guest' | 'registered';
    email: string | null;
    age_band: AgeBand;
    region: string | null;
    display_name: string;
    level: number;
    xp: string;
    gold: string;
    created_at: Date;
  }>(
    `SELECT u.id, u.kind, u.email, u.age_band, u.region, u.created_at,
            p.display_name, p.level, p.xp, p.gold
       FROM users u JOIN players p ON p.user_id = u.id
      WHERE u.id = $1 AND u.status = 'active'`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    email: r.email,
    ageBand: r.age_band,
    region: r.region ? r.region.trim() : null,
    displayName: r.display_name,
    level: r.level,
    // bigint columns arrive as strings; game values stay far below 2^53
    xp: Number(r.xp),
    gold: Number(r.gold),
    canUseWeb3: canUseWeb3(r.age_band),
    createdAt: r.created_at.toISOString(),
  };
}
