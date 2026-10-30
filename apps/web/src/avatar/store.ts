import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_AVATAR, type AvatarLook } from '@nyrgo/shared';
import type { Api } from '../api';

/**
 * The player's look, shared by the map and the wardrobe: loaded once, updated when the player
 * changes it. Until it loads (or if it cannot), the default explorer is shown.
 */
let look: AvatarLook = DEFAULT_AVATAR;
const listeners = new Set<() => void>();
const loaded = new WeakSet<Api>();

export function setLook(next: AvatarLook) {
  look = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLook(api: Api): AvatarLook {
  useEffect(() => {
    if (loaded.has(api)) return;
    loaded.add(api);
    api
      .avatar()
      .then((s) => s?.avatar && setLook(s.avatar))
      .catch(() => loaded.delete(api));
  }, [api]);
  return useSyncExternalStore(subscribe, () => look);
}
