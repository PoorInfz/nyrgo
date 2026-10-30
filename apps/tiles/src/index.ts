import { PMTiles, ResolvedValueCache, type RangeResponse, type Source } from 'pmtiles';

/**
 * The street map for anywhere: serves vector tiles out of PMTiles archives stored in R2.
 *   GET /<archive>/{z}/{x}/{y}.mvt   → one tile (204 when the archive has none there)
 *   GET /<archive>.json              → TileJSON
 * Archives are files `<archive>.pmtiles` in the bucket (e.g. planet.pmtiles from Protomaps).
 * Answers are cached at the edge; only the game's own origins may read them from a browser.
 */

/** The parts of an R2 bucket this Worker uses (a subset of Cloudflare's R2Bucket). */
export interface Bucket {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; etag: string } | null>;
}

export interface Env {
  BUCKET: Bucket;
  /** Comma-separated origins allowed to fetch tiles (CORS), e.g. https://app.nyrgo.fun. */
  ALLOWED_ORIGINS: string;
}

class R2Source implements Source {
  constructor(
    private readonly bucket: Bucket,
    private readonly key: string,
  ) {}
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const obj = await this.bucket.get(this.key, { range: { offset, length } });
    if (!obj) throw new NotFound(this.key);
    return { data: await obj.arrayBuffer(), etag: obj.etag };
  }
}

class NotFound extends Error {}

// kept between requests on the same isolate: each archive's header and directories are read once
const directories = new ResolvedValueCache(50);
const archives = new Map<string, PMTiles>();

function archive(env: Env, name: string): PMTiles {
  let p = archives.get(name);
  if (!p) {
    p = new PMTiles(new R2Source(env.BUCKET, `${name}.pmtiles`), directories);
    archives.set(name, p);
  }
  return p;
}

const TILE = /^\/([a-z0-9_-]+)\/(\d{1,2})\/(\d+)\/(\d+)\.mvt$/;
const TILEJSON = /^\/([a-z0-9_-]+)\.json$/;

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return origin && (allowed.includes(origin) || allowed.includes('*'))
    ? { 'access-control-allow-origin': origin, vary: 'origin' }
    : { vary: 'origin' };
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const cors = corsHeaders(env, req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'GET',
        'access-control-max-age': '86400',
      },
    });
  }
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });

  try {
    const t = TILE.exec(url.pathname);
    if (t) {
      const [, name, z, x, y] = t as unknown as [string, string, string, string, string];
      const zi = Number(z);
      const n = 2 ** zi;
      if (zi > 22 || Number(x) >= n || Number(y) >= n) {
        return new Response('bad tile', { status: 400, headers: cors });
      }
      const tile = await archive(env, name).getZxy(zi, Number(x), Number(y));
      const headers = {
        ...cors,
        'cache-control': 'public, max-age=86400',
        'content-type': 'application/vnd.mapbox-vector-tile',
      };
      return tile
        ? new Response(tile.data, { headers })
        : new Response(null, { status: 204, headers });
    }
    const j = TILEJSON.exec(url.pathname);
    if (j) {
      const name = j[1]!;
      const base = `${url.origin}/${name}`;
      return Response.json(await archive(env, name).getTileJson(base), {
        headers: { ...cors, 'cache-control': 'public, max-age=3600' },
      });
    }
  } catch (e) {
    if (e instanceof NotFound) return new Response('no such map', { status: 404, headers: cors });
    throw e;
  }
  return new Response('not found', { status: 404, headers: cors });
}

interface CacheStorageWithDefault {
  default: Cache;
}

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    // Tiles are the same for everyone: answer from the edge cache when we can.
    const edge = (globalThis.caches as unknown as CacheStorageWithDefault | undefined)?.default;
    const key = new Request(new URL(req.url).toString(), { method: 'GET' });
    if (req.method === 'GET' && edge) {
      const hit = await edge.match(key);
      if (hit) {
        // the cached copy carries no CORS header: add this caller's
        const res = new Response(hit.body, hit);
        for (const [k, v] of Object.entries(corsHeaders(env, req.headers.get('origin')))) {
          res.headers.set(k, v);
        }
        return res;
      }
    }
    const res = await handle(req, env);
    if (req.method === 'GET' && edge && res.status === 200) {
      const copy = new Response(res.clone().body, res);
      copy.headers.delete('access-control-allow-origin');
      ctx.waitUntil(edge.put(key, copy));
    }
    return res;
  },
};
