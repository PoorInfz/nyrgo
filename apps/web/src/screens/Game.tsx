import { lazy, Suspense, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Feedback } from '../components/Feedback';
import type { Api, Profile } from '../api';
import { Home } from './Home';
import { Play } from './Play';
import { DexScreen } from './DexScreen';
import { Collection } from './Collection';
import { Bag } from './Bag';
import { Social } from './Social';
import { ensureDeviceCheck } from '../near/deviceCheck';

// the town is a separate chunk: it loads when a player first walks in
const HubScreen = lazy(() => import('../hub/HubScreen'));

type Tab = 'play' | 'collection' | 'bag' | 'dex' | 'social' | 'profile';

/** Menu icons, drawn for the game: a map pin, two creatures, a satchel, a book, two friends, an explorer. */
const ICONS: Record<Tab, ReactNode> = {
  play: (
    <path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Zm0-9a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
  ),
  collection: (
    <>
      <path d="M8.5 20c-3 0-5-1.9-5-4.6 0-3.4 2.4-6.4 5-6.4s5 3 5 6.4c0 2.7-2 4.6-5 4.6Z" />
      <circle cx="6.8" cy="14.5" r="0.9" fill="currentColor" />
      <circle cx="10.2" cy="14.5" r="0.9" fill="currentColor" />
      <path d="M15 6.5c1.6-2.3 5.3-1.6 5.5 1.5.2 2.6-1.8 5-4.5 5.5" />
      <path d="M5.5 9.5 4.5 6l3 1.6M11.5 9.5l1-3.5-3 1.6" />
    </>
  ),
  bag: (
    <>
      <path d="M5 9h14l-1.2 10.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8L5 9Z" />
      <path d="M9 9V6.5a3 3 0 0 1 6 0V9M5 13h14" />
    </>
  ),
  dex: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5M12 7.5l1 2.2 2.3.2-1.8 1.5.6 2.3-2.1-1.3-2.1 1.3.6-2.3-1.8-1.5 2.3-.2 1-2.2Z" />
    </>
  ),
  social: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M15.5 14.6c2.9-.4 5 1.3 5.5 4.4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6M7.5 6.5C9 3 15 3 16.5 6.5" />
    </>
  ),
};

const LABELS: Record<Tab, string> = {
  play: 'tabPlay',
  collection: 'tabCollection',
  bag: 'tabBag',
  dex: 'tabDex',
  social: 'tabSocial',
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
  const [inTown, setInTown] = useState(false);
  // Android app: today's device check, quietly (rewards may need it; play never does)
  useEffect(() => {
    void ensureDeviceCheck(api).catch(() => undefined);
  }, [api]);
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
      {!inTown && <Feedback api={api} screen={tab} />}
      {inTown && (
        <Suspense fallback={<div className="hub" role="status" aria-label={t('loading')} />}>
          <HubScreen api={api} apiUrl={api.baseUrl} onExit={() => setInTown(false)} />
        </Suspense>
      )}
      <nav className="tabs" role="tablist" aria-label={t('tabsLabel')}>
        {(['play', 'collection', 'bag', 'dex', 'social', 'profile'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[id]}
            </svg>
            <span>{t(LABELS[id])}</span>
          </button>
        ))}
      </nav>
      <div ref={panel} tabIndex={-1} role="tabpanel" aria-label={t(LABELS[tab])} className="panel">
        {/* Play stays mounted while the profile is open so GPS and the map are not restarted. */}
        <div hidden={tab !== 'play'}>
          <section className="card town-card" aria-labelledby="town-title">
            <div>
              <h2 id="town-title">{t('hub.enterTitle')}</h2>
              <p className="muted small">{t('hub.enterText')}</p>
            </div>
            <button type="button" onClick={() => setInTown(true)}>
              {t('hub.enter')}
            </button>
          </section>
          <Play api={api} />
        </div>
        {tab === 'collection' && <Collection api={api} />}
        {tab === 'bag' && <Bag api={api} />}
        {tab === 'dex' && <DexScreen api={api} />}
        {tab === 'social' && <Social api={api} />}
        {tab === 'profile' && (
          <Home api={api} profile={profile} onChange={onChange} onSignedOut={onSignedOut} />
        )}
      </div>
    </div>
  );
}
