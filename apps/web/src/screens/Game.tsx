import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api, Profile } from '../api';
import { Home } from './Home';
import { Play } from './Play';
import { DexScreen } from './DexScreen';
import { Collection } from './Collection';
import { Bag } from './Bag';

type Tab = 'play' | 'collection' | 'bag' | 'dex' | 'profile';

const LABELS: Record<Tab, string> = {
  play: 'tabPlay',
  collection: 'tabCollection',
  bag: 'tabBag',
  dex: 'tabDex',
  profile: 'tabProfile',
};

/** Signed-in shell: the map to play, and the profile with account and privacy controls. */
export function Game({
  api,
  profile,
  onChange,
  onSignedOut,
}: {
  api: Api;
  profile: Profile;
  onChange: (p: Profile) => void;
  onSignedOut: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('play');
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // Moving focus into the new panel lets keyboard and screen-reader users follow the change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    panel.current?.focus();
  }, [tab]);

  return (
    <div className="stack">
      <nav className="tabs" role="tablist" aria-label={t('tabsLabel')}>
        {(['play', 'collection', 'bag', 'dex', 'profile'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            {t(LABELS[id])}
          </button>
        ))}
      </nav>
      <div ref={panel} tabIndex={-1} role="tabpanel" aria-label={t(LABELS[tab])} className="panel">
        {/* Play stays mounted while the profile is open so GPS and the map are not restarted. */}
        <div hidden={tab !== 'play'}>
          <Play api={api} />
        </div>
        {tab === 'collection' && <Collection api={api} />}
        {tab === 'bag' && <Bag api={api} />}
        {tab === 'dex' && <DexScreen api={api} />}
        {tab === 'profile' && (
          <Home api={api} profile={profile} onChange={onChange} onSignedOut={onSignedOut} />
        )}
      </div>
    </div>
  );
}
