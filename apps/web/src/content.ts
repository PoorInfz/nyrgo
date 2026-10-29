import { useEffect, useState } from 'react';
import type { Api, Dex } from './api';

/**
 * The game content (creatures, elements, skills) is fetched once per API client and shared by
 * every screen. The server sends it with a long cache lifetime and an ETag.
 */
const cache = new WeakMap<Api, Promise<Dex>>();

export function loadContent(api: Api): Promise<Dex> {
  let p = cache.get(api);
  if (!p) {
    p = api.dex();
    // a failed load may be retried later
    p.catch(() => cache.delete(api));
    cache.set(api, p);
  }
  return p;
}

/** `enabled` lets a screen wait until it actually needs the content. */
export function useContent(api: Api, enabled = true): { dex: Dex | null; failed: boolean } {
  const [state, setState] = useState<{ dex: Dex | null; failed: boolean }>({
    dex: null,
    failed: false,
  });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadContent(api)
      .then((dex) => live && setState({ dex, failed: false }))
      .catch(() => live && setState({ dex: null, failed: true }));
    return () => {
      live = false;
    };
  }, [api, enabled]);
  return state;
}

/** Portrait URL for a creature id (the same file the Dex lists). */
export const artUrl = (creatureId: string) => `/creatures/${creatureId}.svg`;
