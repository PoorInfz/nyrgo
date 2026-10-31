import type { AvatarLook } from '@nyrgo/shared';

/**
 * The town's live connection: positions, emotes and chat over one WebSocket, reconnecting with
 * back-off when the network drops. Nothing that matters travels here (no rewards, no items), so
 * a lost message is harmless.
 */

export interface HubProfile {
  id: string;
  name: string;
  level: number;
  look: AvatarLook;
  companion: string | null;
}

export type HubEvent =
  | { t: 'welcome'; you: string; room: string; x: number; y: number; ageGroup: 'adult' | 'minor' }
  | { t: 'state'; players: [string, number, number, 'l' | 'r', 0 | 1][]; profiles?: HubProfile[] }
  | { t: 'pos'; x: number; y: number }
  | { t: 'emote'; id: string; e: string }
  | { t: 'chat'; id: string; mid: string; name: string; text: string; at: number }
  | { t: 'error'; code: string };

export type HubStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface HubConnection {
  move(x: number, y: number, facing: 'l' | 'r', moving: boolean): void;
  emote(e: string): void;
  chat(text: string): void;
  /** Through a door the player is standing at. */
  go(id: string): void;
  close(): void;
}

/** `wss://api…/v1/hub/ws` from the API's base URL. */
export function hubSocketUrl(apiUrl: string): string {
  const u = new URL('/v1/hub/ws', apiUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

export function connectHub(
  url: string,
  on: { event: (e: HubEvent) => void; status: (s: HubStatus) => void },
  make: (url: string) => WebSocket = (u) => new WebSocket(u),
): HubConnection {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  // the latest position, sent at most ten times a second
  let pending: { x: number; y: number; f: 'l' | 'r'; m: 0 | 1 } | null = null;
  let lastSent = '';
  const flush = setInterval(() => {
    if (!pending || ws?.readyState !== WebSocket.OPEN) return;
    const key = `${pending.x},${pending.y},${pending.f},${pending.m}`;
    if (key === lastSent) return;
    lastSent = key;
    ws.send(JSON.stringify({ t: 'move', ...pending }));
  }, 100);

  function open() {
    on.status(attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = make(url);
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      lastSent = '';
      on.status('open');
    };
    socket.onmessage = (ev) => {
      try {
        on.event(JSON.parse(String(ev.data)) as HubEvent);
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = (ev) => {
      if (ws !== socket) return;
      ws = null;
      // replaced by another tab, or the server refused us: do not fight it
      if (stopped || ev.code === 4000 || ev.code === 4001 || ev.code === 1008) {
        on.status('closed');
        return;
      }
      attempt++;
      on.status('reconnecting');
      const delay = Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() / 2);
      retry = setTimeout(open, delay);
    };
  }
  open();

  const send = (m: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  return {
    move(x, y, facing, moving) {
      pending = { x: Math.round(x), y: Math.round(y), f: facing, m: moving ? 1 : 0 };
    },
    emote: (e) => send({ t: 'emote', e }),
    chat: (text) => send({ t: 'chat', text }),
    go: (id) => send({ t: 'go', id }),
    close() {
      stopped = true;
      clearInterval(flush);
      if (retry) clearTimeout(retry);
      ws?.close();
      ws = null;
    },
  };
}
