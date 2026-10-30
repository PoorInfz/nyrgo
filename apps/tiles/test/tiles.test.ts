import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handle, type Bucket, type Env } from '../src/index.js';

const file = readFileSync(new URL('./fixtures/tiny.pmtiles', import.meta.url));

/** An R2 bucket holding one archive, answering ranged reads like R2 does. */
const bucket: Bucket = {
  async get(key, options) {
    if (key !== 'tiny.pmtiles') return null;
    const { offset, length } = options?.range ?? { offset: 0, length: file.length };
    const slice = file.subarray(offset, offset + length);
    return {
      etag: 'e1',
      arrayBuffer: async () =>
        slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
    };
  },
};
const env: Env = { BUCKET: bucket, ALLOWED_ORIGINS: 'https://app.nyrgo.test' };
const get = (path: string, origin?: string) =>
  handle(
    new Request(`https://tiles.nyrgo.test${path}`, origin ? { headers: { origin } } : {}),
    env,
  );

describe('tiles worker', () => {
  it('serves a tile, decompressed, with caching and CORS for the app', async () => {
    const res = await get('/tiny/14/7966/6327.mvt', 'https://app.nyrgo.test');
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe('tile-14-7966-6327');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.nyrgo.test');
    expect(res.headers.get('cache-control')).toMatch(/max-age/);
    expect(res.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
  });

  it('answers 204 where the archive has no tile, and 400 for impossible tiles', async () => {
    expect((await get('/tiny/14/0/0.mvt')).status).toBe(204);
    expect((await get('/tiny/3/9/0.mvt')).status).toBe(400);
  });

  it('does not grant CORS to other sites', async () => {
    const res = await get('/tiny/0/0/0.mvt', 'https://elsewhere.test');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('describes an archive as TileJSON, and 404s unknown ones', async () => {
    const tj = (await (await get('/tiny.json')).json()) as { tiles: string[]; maxzoom: number };
    expect(tj.tiles).toEqual(['https://tiles.nyrgo.test/tiny/{z}/{x}/{y}.mvt']);
    expect(tj.maxzoom).toBe(14);
    expect((await get('/nothing/0/0/0.mvt')).status).toBe(404);
    expect((await get('/x')).status).toBe(404);
  });
});
