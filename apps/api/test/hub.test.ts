import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { syncContent } from '../src/modules/content/sync.js';
import { grantReward } from '../src/modules/progress/rewards.js';
import { withTx } from '../src/db.js';
import { Room } from '../src/modules/hub/room.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const ADMIN = 'h'.repeat(40);

type Msg = { t: string; [k: string]: unknown };

/** A connected client that keeps every message, with a way to wait for one. */
function client(ws: WebSocket) {
  const got: Msg[] = [];
  const waiters: { pred: (m: Msg) => boolean; done: (m: Msg) => void }[] = [];
  ws.on('message', (d: Buffer) => {
    const m = JSON.parse(d.toString()) as Msg;
    got.push(m);
    for (const w of [...waiters]) {
      if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.done(m);
      }
    }
  });
  return {
    ws,
    got,
    send: (m: object) => ws.send(JSON.stringify(m)),
    next: (pred: (m: Msg) => boolean, ms = 2000) =>
      new Promise<Msg>((resolve, reject) => {
        const hit = got.find(pred);
        if (hit) return resolve(hit);
        const timer = setTimeout(() => reject(new Error('timed out')), ms);
        waiters.push({
          pred,
          done: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        });
      }),
  };
}

describe.skipIf(!TEST_DB_URL)('the hub', () => {
  let t: TestApp;
  const room = new Room('plaza', { autoTick: false });
  beforeAll(async () => {
    t = await makeTestApp({
      hubRooms: new Map([['plaza', room]]),
      env: { ADMIN_TOKENS: `mod:admin:${ADMIN}` },
    });
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const open = async () => {
      const ws = await t.app.injectWS('/v1/hub/ws', {
        headers: { ...cookieHeader(g.token), origin: 'http://app.test' },
      });
      const c = client(ws);
      await c.next((m) => m.t === 'welcome');
      return c;
    };
    const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: { ...cookieHeader(g.token), origin: 'http://app.test' },
      });
    return { id: g.profile.id as string, open, call };
  }

  it('refuses sockets without a session or from another site, before the upgrade', async () => {
    // a real server: refusals are HTTP answers to the upgrade request
    const addr = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const url = `${addr.replace('http', 'ws')}/v1/hub/ws`;
    const status = (headers: Record<string, string>) =>
      new Promise<number | string>((resolve) => {
        const ws = new WebSocket(url, { headers });
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
        ws.on('open', () => {
          resolve('open');
          ws.close();
        });
        ws.on('error', () => undefined);
      });
    expect(await status({ origin: 'http://app.test' })).toBe(401);
    const g = await createGuest(t.app);
    expect(await status({ ...cookieHeader(g.token), origin: 'https://evil.test' })).toBe(403);
    expect(await status({ ...cookieHeader(g.token), origin: 'http://app.test' })).toBe('open');
  });

  it('shows players to each other, moving and emoting', async () => {
    const a = await player();
    const b = await player();
    const ca = await a.open();
    const cb = await b.open();
    room.tick();
    const st = await ca.next(
      (m) => m.t === 'state' && (m.players as unknown[][]).some((p) => p[0] === b.id),
    );
    const prof = (st.profiles as { id: string; look: unknown; companion: string }[]).find(
      (p) => p.id === b.id,
    )!;
    expect(prof.look).toBeTruthy();
    const me = room.members.get(a.id)!;
    const x0 = me.x;
    await new Promise((r) => setTimeout(r, 300));
    ca.send({ t: 'move', x: x0 + 30, y: me.y, f: 'r', m: 1 });
    await new Promise((r) => setTimeout(r, 50));
    expect(room.members.get(a.id)!.x).toBe(x0 + 30);
    ca.send({ t: 'emote', e: 'wave' });
    expect(await cb.next((m) => m.t === 'emote')).toEqual({ t: 'emote', id: a.id, e: 'wave' });
    ca.ws.terminate();
    cb.ws.terminate();
  });

  it('chats within age groups, filtered, logged, reportable and moderated', async () => {
    const adult = await player();
    const adult2 = await player();
    const teen = await player(new Date().getFullYear() - 15);
    const ca = await adult.open();
    const ca2 = await adult2.open();
    const ct = await teen.open();
    ca.send({ t: 'chat', text: '  hola   a todos ' });
    const heard = await ca2.next((m) => m.t === 'chat');
    expect(heard).toMatchObject({ id: adult.id, text: 'hola a todos' });
    ca.send({ t: 'chat', text: 'add me on discord' });
    expect(await ca.next((m) => m.t === 'error')).toEqual({ t: 'error', code: 'chat_link' });
    ct.send({ t: 'chat', text: 'hi from the teen' });
    expect(await ct.next((m) => m.t === 'chat')).toMatchObject({ text: 'hi from the teen' });
    await new Promise((r) => setTimeout(r, 100));
    // nobody outside the age group heard anything
    expect(ct.got.filter((m) => m.t === 'chat').map((m) => m.text)).toEqual(['hi from the teen']);
    expect(ca2.got.filter((m) => m.t === 'chat').map((m) => m.text)).toEqual(['hola a todos']);

    // report and mute
    const rep = await adult2.call('POST', '/v1/hub/reports', {
      message: Number(heard.mid),
      reason: 'harassment',
    });
    expect(rep.json()).toEqual({ received: true });
    const admin = (method: 'GET' | 'POST', url: string, payload?: object) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: { authorization: `Bearer ${ADMIN}` },
      });
    const open = (await admin('GET', '/admin/v1/hub/reports')).json().reports;
    const mine = open.find((r: { reported_id: string }) => r.reported_id === adult.id);
    expect(mine).toMatchObject({ body: 'hola a todos', reason: 'harassment' });
    expect(
      (
        await admin('POST', `/admin/v1/hub/reports/${mine.id}/close`, {
          decision: 'mute',
          minutes: 60,
          reason: 'insults in chat',
        })
      ).json(),
    ).toEqual({ closed: true });
    ca.send({ t: 'chat', text: 'still here?' });
    expect(await ca.next((m) => m.t === 'error' && m.code === 'chat_muted')).toBeTruthy();
    const hidden = await t.db.query(`SELECT hidden_at FROM hub_chat WHERE id = $1`, [heard.mid]);
    expect(hidden.rows[0].hidden_at).not.toBeNull();
    for (const c of [ca, ca2, ct]) c.ws.terminate();
  });

  it('lets players block each other: they stop hearing and seeing each other', async () => {
    const a = await player();
    const b = await player();
    const ca = await a.open();
    const cb = await b.open();
    expect((await b.call('POST', `/v1/hub/blocks/${a.id}`)).json()).toEqual({ blocked: true });
    ca.send({ t: 'chat', text: 'can you hear me' });
    await ca.next((m) => m.t === 'chat');
    await new Promise((r) => setTimeout(r, 100));
    expect(cb.got.some((m) => m.t === 'chat' && m.id === a.id)).toBe(false);
    cb.got.length = 0;
    room.tick();
    const st = await cb.next((m) => m.t === 'state');
    expect((st.players as unknown[][]).some((p) => p[0] === a.id)).toBe(false);
    expect((await b.call('GET', '/v1/hub/blocks')).json().blocked).toEqual([
      expect.objectContaining({ id: a.id }),
    ]);
    expect((await b.call('DELETE', `/v1/hub/blocks/${a.id}`)).statusCode).toBe(204);
    ca.ws.terminate();
    cb.ws.terminate();
  });

  it('follows the 50 % rule and lets players pick their own companion', async () => {
    const p = await player();
    // 500 XP outdoors, 2,000 in the hub: only 500 of the hub XP counts
    await withTx(t.db, async (c) => {
      await grantReward(c, p.id, { xp: 500, gold: 0, reason: 'test', refId: crypto.randomUUID() });
      await grantReward(c, p.id, {
        xp: 2000,
        gold: 0,
        reason: 'test',
        refId: crypto.randomUUID(),
        source: 'hub',
      });
    });
    const me = (await p.call('GET', '/v1/hub/me')).json();
    expect(me.progress).toMatchObject({
      mainXp: 500,
      hubXp: 2000,
      hubCounted: 500,
      hubWaiting: 1500,
      xp: 1000,
      level: 5,
      hubShare: 0.5,
    });
    const profile = (await p.call('GET', '/v1/me')).json();
    expect(profile).toMatchObject({ xp: 1000, level: 5 });

    // companion: own creatures only
    const { rows } = await t.db.query<{ id: string }>(
      `INSERT INTO creature_instances (definition_id, owner_id, level, ivs, hp_current, acquired_via, acquired_ref)
       VALUES ('dropling', $1, 5, '{"hp":5,"atk":5,"def":5,"spd":5}', 30, 'capture', gen_random_uuid()) RETURNING id`,
      [p.id],
    );
    expect((await p.call('PUT', '/v1/hub/companion', { creature: rows[0]!.id })).statusCode).toBe(
      200,
    );
    expect((await p.call('GET', '/v1/hub/me')).json().companion).toBe('dropling');
    const other = await player();
    expect(
      (await other.call('PUT', '/v1/hub/companion', { creature: rows[0]!.id })).json().code,
    ).toBe('not_found');
  });
});
