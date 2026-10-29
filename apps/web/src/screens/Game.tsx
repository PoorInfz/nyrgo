import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api, Profile } from '../api';
import { Home } from './Home';
import { Play } from './Play';
import { DexScreen } from './DexScreen';
import { Collection } from './Collection';

type Tab = 'play' | 'collection' | 'dex' | 'profile';

const LABELS: Record<Tab, string> = {
  play: 'tabPlay',
  collection: 'tabCollection',
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

  return (
    <div className="stack">
      <nav className="tabs" role="tablist" aria-label={t('tabsLabel')}>
        {(['play', 'collection', 'dex', 'profile'] as const).map((id) => (
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
      {/* Play stays mounted while the profile is open so GPS and the map are not restarted. */}
      <div hidden={tab !== 'play'}>
        <Play api={api} />
      </div>
      {tab === 'collection' && <Collection api={api} />}
      {tab === 'dex' && <DexScreen api={api} />}
      {tab === 'profile' && (
        <Home api={api} profile={profile} onChange={onChange} onSignedOut={onSignedOut} />
      )}
    </div>
  );
}
