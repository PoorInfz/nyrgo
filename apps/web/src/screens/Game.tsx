import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api, Profile } from '../api';
import { Home } from './Home';
import { Play } from './Play';

type Tab = 'play' | 'profile';

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
        {(['play', 'profile'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            {t(id === 'play' ? 'tabPlay' : 'tabProfile')}
          </button>
        ))}
      </nav>
      {/* Play stays mounted while the profile is open so GPS and the map are not restarted. */}
      <div hidden={tab !== 'play'}>
        <Play api={api} />
      </div>
      {tab === 'profile' && (
        <Home api={api} profile={profile} onChange={onChange} onSignedOut={onSignedOut} />
      )}
    </div>
  );
}
