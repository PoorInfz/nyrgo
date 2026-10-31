import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { houseOwnerOf, hubMap, type Interaction } from '@nyrgo/shared';
import type { HouseView } from '../api';
import type { Api } from '../api';
import { useLook } from '../avatar/store';
import { ArenaPanel, GymPanel } from './Activities';
import { BoardPanel } from './Board';
import { DecoratePanel, HousesPanel } from './House';
import { MarketPanel } from './Market';
import { EMOTE_ICONS, Town, newBody } from './engine';
import { connectHub, hubSocketUrl, type HubConnection, type HubEvent, type HubStatus } from './net';

interface ChatLine {
  mid: string;
  id: string;
  name: string;
  text: string;
  mine: boolean;
}

type Dialog =
  | { kind: 'npc'; id: string }
  | { kind: 'place'; id: string; place: Interaction['kind'] }
  | { kind: 'exit' }
  | { kind: 'report'; line: ChatLine }
  | { kind: 'gym' }
  | { kind: 'arena' }
  | { kind: 'market' }
  | { kind: 'houses' }
  | { kind: 'decorate' }
  | { kind: 'board' }
  | null;

/** NPCs with something to do rather than just a word. */
const NPC_PANELS: Record<string, 'gym' | 'arena' | 'market' | 'board'> = {
  guide: 'board',
  coach: 'gym',
  host: 'arena',
  merchant: 'market',
};
/** Dialogs that hold a whole panel (wider, scrolling). */
const PANELS = new Set(['gym', 'arena', 'market', 'houses', 'decorate', 'board']);

const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'personal_info', 'other'] as const;

/**
 * The town (hub): a shared 2D square to meet other players. Full screen over the game; leaving
 * returns to the map without reloading anything.
 */
export default function HubScreen({
  api,
  apiUrl,
  onExit,
}: {
  api: Api;
  apiUrl: string;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const look = useLook(api);
  // the world is imperative (a game loop mutates it 60 times a second): it lives in a ref and
  // is only touched from effects and event handlers
  const townRef = useRef<Town | null>(null);
  const getTown = useCallback(() => (townRef.current ??= new Town(hubMap('plaza')!)), []);
  const [roomId, setRoomId] = useState('plaza');
  /** The house the player is in, if any (its furniture also goes to the town to be drawn). */
  const [house, setHouse] = useState<HouseView | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const conn = useRef<HubConnection | null>(null);
  const me = useRef<{ name: string; level: number; companion: string | null } | null>(null);
  const [status, setStatus] = useState<HubStatus>('connecting');
  const [count, setCount] = useState(1);
  const [near, setNear] = useState<Interaction | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [emotes, setEmotes] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<'adult' | 'minor' | null>(null);
  const lookRef = useRef(look);
  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  const say = useCallback(
    (key: string) => {
      setToast(t(key));
      window.setTimeout(() => setToast(null), 3500);
    },
    [t],
  );

  /** What happens at the thing the player stands next to. */
  const open = useCallback((n: Interaction | null) => {
    if (!n) return;
    if (n.to) conn.current?.go(n.id);
    else if (n.kind === 'exit') setDialog({ kind: 'exit' });
    else if (n.kind === 'market') setDialog({ kind: 'market' });
    else if (n.kind === 'house') setDialog({ kind: 'houses' });
    else if (n.kind === 'npc') {
      const id = n.id.replace('npc:', '');
      const panel = NPC_PANELS[id];
      setDialog(panel ? { kind: panel } : { kind: 'npc', id });
    } else setDialog({ kind: 'place', id: n.id, place: n.kind });
  }, []);

  const loadHouse = useCallback(
    async (owner: string) => {
      try {
        const h = await api.hubHouse(owner);
        const town = getTown();
        if (houseOwnerOf(town.map.id) !== owner) return;
        town.furniture = h.layout;
        setHouse(h);
      } catch {
        // the door closed meanwhile: the server shows the player out
      }
    },
    [api, getTown],
  );

  // who I am in the town, then the live connection
  useEffect(() => {
    const town = getTown();
    let live = true;
    api
      .hubMe()
      .then((h) => {
        if (!live) return;
        me.current = { name: h.name, level: h.progress.level, companion: h.companion };
        setAgeGroup(h.ageGroup);
      })
      .catch(() => undefined);
    const c = connectHub(hubSocketUrl(apiUrl), {
      status: (s) => live && setStatus(s),
      event: (e: HubEvent) => {
        if (!live) return;
        const now = performance.now();
        if (e.t === 'welcome') {
          // a door (or a reconnection) can put the player in another room
          if (e.room !== town.map.id) {
            const next = hubMap(e.room);
            if (next) {
              town.setMap(next);
              setDialog(null);
              setNear(null);
            }
          }
          setRoomId(e.room);
          setMyId(e.you);
          const owner = houseOwnerOf(e.room);
          setHouse(null);
          if (owner) void loadHouse(owner);
          town.meId = e.you;
          const prev = town.bodies.get(e.you);
          const info = me.current;
          town.bodies.set(
            e.you,
            newBody({
              id: e.you,
              name: info?.name ?? prev?.name ?? '…',
              level: info?.level ?? 1,
              look: lookRef.current,
              companion: info?.companion ?? null,
              x: e.x,
              y: e.y,
            }),
          );
          setAgeGroup(e.ageGroup);
        } else if (e.t === 'state') {
          for (const p of e.profiles ?? []) {
            const b = town.bodies.get(p.id);
            if (b)
              Object.assign(b, {
                name: p.name,
                level: p.level,
                look: p.look,
                companion: p.companion,
              });
            else town.bodies.set(p.id, newBody({ ...p, x: 0, y: 0 }));
          }
          for (const b of town.bodies.values()) b.seen = b.id === town.meId;
          for (const [id, x, y, f, m] of e.players) {
            const b = town.bodies.get(id);
            if (!b || id === town.meId) continue;
            if (b.x === 0 && b.y === 0) {
              b.x = x;
              b.y = y;
            }
            b.tx = x;
            b.ty = y;
            b.facing = f;
            b.moving = m === 1;
            b.seen = true;
          }
          for (const [id, b] of town.bodies) if (!b.seen) town.bodies.delete(id);
          setCount(town.bodies.size);
        } else if (e.t === 'pos') {
          const b = town.me();
          if (b) {
            b.x = b.tx = e.x;
            b.y = b.ty = e.y;
          }
        } else if (e.t === 'emote') {
          const b = town.bodies.get(e.id);
          if (b) b.emote = { e: e.e, until: now + 2500 };
        } else if (e.t === 'chat') {
          const b = town.bodies.get(e.id);
          if (b) b.bubble = { text: e.text, until: now + 5000 };
          setChat((c) =>
            [
              ...c,
              { mid: e.mid, id: e.id, name: e.name, text: e.text, mine: e.id === town.meId },
            ].slice(-40),
          );
        } else if (e.t === 'error') {
          say(`hub.err.${e.code}`);
        } else if (e.t === 'house') {
          const owner = houseOwnerOf(town.map.id);
          if (owner) void loadHouse(owner);
        }
      },
    });
    conn.current = c;
    return () => {
      live = false;
      c.close();
      conn.current = null;
    };
  }, [api, apiUrl, getTown, say, loadHouse]);

  // my look can change in the wardrobe; keep the drawn one in step
  useEffect(() => {
    const b = getTown().me();
    if (b) b.look = look;
  }, [look, getTown]);

  // keyboard
  useEffect(() => {
    const town = getTown();
    const keys = new Set<string>();
    const act = () => open(town.nearby());
    const sync = () => {
      town.input.x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      town.input.y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    };
    const dir = (k: string) =>
      ({
        ArrowLeft: 'left',
        a: 'left',
        A: 'left',
        ArrowRight: 'right',
        d: 'right',
        D: 'right',
        ArrowUp: 'up',
        w: 'up',
        W: 'up',
        ArrowDown: 'down',
        s: 'down',
        S: 'down',
      })[k];
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      )
        return;
      const d = dir(e.key);
      if (d) {
        keys.add(d);
        sync();
        e.preventDefault();
      } else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        act();
      } else if (e.key === 't' || e.key === 'T') {
        setChatOpen(true);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setDialog(null);
        setEmotes(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      const d = dir(e.key);
      if (d) {
        keys.delete(d);
        sync();
      }
    };
    const blur = () => {
      keys.clear();
      sync();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [getTown, open]);

  // the loop: move, follow, draw
  useEffect(() => {
    const town = getTown();
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let nearId: string | null = null;
    const size = { w: 0, h: 0, dpr: 1 };
    const resize = () => {
      const r = el.getBoundingClientRect();
      size.dpr = Math.min(2, window.devicePixelRatio || 1);
      size.w = r.width;
      size.h = r.height;
      el.width = Math.round(r.width * size.dpr);
      el.height = Math.round(r.height * size.dpr);
      town.camera.zoom = Math.max(1, Math.min(2.4, Math.min(r.width / 430, r.height / 560)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moved = town.update(dt, now);
      const b = town.me();
      if (b && (moved || !b.moving)) conn.current?.move(b.x, b.y, b.facing, b.moving);
      town.follow(size.w, size.h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      town.draw(ctx, size.w, size.h, size.dpr);
      const n = town.nearby();
      if ((n?.id ?? null) !== nearId) {
        nearId = n?.id ?? null;
        setNear(n);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [getTown]);

  const interact = useCallback(() => open(getTown().nearby()), [getTown, open]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    conn.current?.chat(text);
    setDraft('');
  }

  async function report(line: ChatLine, reason: (typeof REPORT_REASONS)[number]) {
    setDialog(null);
    try {
      await api.hubReport(Number(line.mid), reason);
      say('hub.reported');
    } catch {
      say('errors.other');
    }
  }

  async function block(line: ChatLine) {
    setDialog(null);
    try {
      await api.hubBlock(line.id);
      setChat((c) => c.filter((l) => l.id !== line.id));
      getTown().bodies.delete(line.id);
      say('hub.blocked');
    } catch {
      say('errors.other');
    }
  }

  const statusText =
    status === 'open'
      ? t('hub.online', { count })
      : status === 'closed'
        ? t('hub.disconnected')
        : t('hub.connecting');

  return (
    <div className="hub" role="dialog" aria-modal="true" aria-label={t('hub.title')}>
      <canvas ref={canvas} className="hub-canvas" aria-label={t('hub.canvasLabel')} role="img" />

      <header className="hub-top">
        <div>
          <strong>
            {houseOwnerOf(roomId)
              ? house
                ? t('hub.room.house', { name: house.name })
                : t('hub.room.houseAny')
              : t(`hub.room.${roomId}`)}
          </strong>
          <span className={`hub-status ${status}`}>{statusText}</span>
        </div>
        <button
          type="button"
          className="secondary small"
          onClick={() => setDialog({ kind: 'exit' })}
        >
          {t('hub.leave')}
        </button>
      </header>

      {toast && (
        <p className="hub-toast" role="status">
          {toast}
        </p>
      )}

      {chatOpen && (
        <section className="hub-chat" aria-label={t('hub.chat')}>
          <p className="muted small">
            {ageGroup === 'minor' ? t('hub.chatMinor') : t('hub.chatAdult')}
          </p>
          <ol className="hub-lines" aria-live="polite">
            {chat.map((l) => (
              <li key={l.mid} className={l.mine ? 'mine' : ''}>
                <strong>{l.name}</strong> {l.text}
                {!l.mine && (
                  <button
                    type="button"
                    className="link small"
                    aria-label={t('hub.reportOf', { name: l.name })}
                    onClick={() => setDialog({ kind: 'report', line: l })}
                  >
                    ⋯
                  </button>
                )}
              </li>
            ))}
          </ol>
          <form onSubmit={send} className="hub-say">
            <label className="sr-only" htmlFor="hub-say">
              {t('hub.say')}
            </label>
            <input
              id="hub-say"
              value={draft}
              maxLength={140}
              autoComplete="off"
              enterKeyHint="send"
              placeholder={t('hub.say')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="small" disabled={!draft.trim()}>
              {t('hub.send')}
            </button>
          </form>
        </section>
      )}

      {emotes && (
        <div className="hub-emotes" role="group" aria-label={t('hub.emotes')}>
          {Object.entries(EMOTE_ICONS).map(([e, icon]) => (
            <button
              key={e}
              type="button"
              aria-label={t(`hub.emote.${e}`)}
              onClick={() => {
                conn.current?.emote(e);
                setEmotes(false);
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      <Joystick
        onMove={(x, y) => {
          const town = getTown();
          town.input.x = x;
          town.input.y = y;
        }}
        label={t('hub.joystick')}
      />

      <div className="hub-actions">
        {near && (
          <button type="button" className="hub-act" onClick={interact}>
            {near.kind === 'npc' && NPC_PANELS[near.id.replace('npc:', '')]
              ? t(`hub.act.${NPC_PANELS[near.id.replace('npc:', '')]}Npc`)
              : t(`hub.act.${near.kind}`)}
          </button>
        )}
        {house?.mine && (
          <button
            type="button"
            className="secondary hub-round"
            aria-label={t('house.decorate')}
            onClick={() => setDialog({ kind: 'decorate' })}
          >
            🛋️
          </button>
        )}
        <button
          type="button"
          className="secondary hub-round"
          aria-label={t('hub.emotes')}
          aria-expanded={emotes}
          onClick={() => setEmotes((v) => !v)}
        >
          😊
        </button>
        <button
          type="button"
          className="secondary hub-round"
          aria-label={t('hub.chat')}
          aria-expanded={chatOpen}
          onClick={() => setChatOpen((v) => !v)}
        >
          💬
        </button>
      </div>

      {dialog && (
        <div
          className={`hub-dialog card${PANELS.has(dialog.kind) ? ' wide' : ''}`}
          role={PANELS.has(dialog.kind) ? 'dialog' : 'alertdialog'}
          aria-labelledby="hub-dialog-title"
        >
          {dialog.kind === 'npc' && (
            <>
              <h2 id="hub-dialog-title">{t(`hub.npc.${dialog.id}.name`)}</h2>
              <p>{t(`hub.npc.${dialog.id}.text`)}</p>
            </>
          )}
          {dialog.kind === 'place' && (
            <>
              <h2 id="hub-dialog-title">{t(`hub.place.${dialog.place}.name`)}</h2>
              <p>{t(`hub.place.${dialog.place}.text`)}</p>
              <p className="muted small">{t('hub.soon')}</p>
            </>
          )}
          {dialog.kind === 'gym' && (
            <>
              <h2 id="hub-dialog-title">{t('hub.npc.coach.name')}</h2>
              <GymPanel api={api} />
            </>
          )}
          {dialog.kind === 'arena' && (
            <>
              <h2 id="hub-dialog-title">{t('hub.npc.host.name')}</h2>
              <ArenaPanel api={api} />
            </>
          )}
          {dialog.kind === 'board' && (
            <>
              <h2 id="hub-dialog-title">{t('hub.npc.guide.name')}</h2>
              <BoardPanel api={api} />
            </>
          )}
          {dialog.kind === 'market' && (
            <>
              <h2 id="hub-dialog-title">{t('hub.npc.merchant.name')}</h2>
              <MarketPanel api={api} />
            </>
          )}
          {dialog.kind === 'houses' && (
            <>
              <h2 id="hub-dialog-title">{t('house.title')}</h2>
              <HousesPanel
                api={api}
                me={myId}
                onVisit={(owner) => {
                  setDialog(null);
                  conn.current?.visit(owner);
                }}
              />
            </>
          )}
          {dialog.kind === 'decorate' && house && (
            <>
              <h2 id="hub-dialog-title">{t('house.decorate')}</h2>
              <DecoratePanel
                api={api}
                layout={house.layout}
                spot={() => {
                  const b = getTown().me();
                  return b ? { x: b.x, y: b.y } : null;
                }}
                onSaved={(layout) => {
                  getTown().furniture = layout;
                  setHouse((h) => (h ? { ...h, layout } : h));
                }}
              />
            </>
          )}
          {dialog.kind === 'exit' && (
            <>
              <h2 id="hub-dialog-title">{t('hub.exitTitle')}</h2>
              <p>{t('hub.exitText')}</p>
              <div className="row">
                <button type="button" onClick={onExit}>
                  {t('hub.exitYes')}
                </button>
                <button type="button" className="secondary" onClick={() => setDialog(null)}>
                  {t('hub.stay')}
                </button>
              </div>
            </>
          )}
          {dialog.kind === 'report' && (
            <>
              <h2 id="hub-dialog-title">{t('hub.reportTitle', { name: dialog.line.name })}</h2>
              <p className="muted">“{dialog.line.text}”</p>
              <div className="stack">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="secondary"
                    onClick={() => report(dialog.line, r)}
                  >
                    {t(`hub.reason.${r}`)}
                  </button>
                ))}
                <button type="button" className="danger" onClick={() => block(dialog.line)}>
                  {t('hub.block', { name: dialog.line.name })}
                </button>
              </div>
            </>
          )}
          {dialog.kind !== 'exit' && (
            <button type="button" className="link" onClick={() => setDialog(null)}>
              {t('hub.close')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A thumb-stick for touch screens; keyboards use arrows or WASD. */
function Joystick({ onMove, label }: { onMove: (x: number, y: number) => void; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 46;

  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / R, dy / R);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={base}
      className="hub-stick"
      aria-label={label}
      role="presentation"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
