import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, createApi, type Profile } from './api';
import { Home } from './screens/Home';
import { Verify } from './screens/Verify';
import { Welcome } from './screens/Welcome';
import './app.css';

type View =
  | { name: 'loading' }
  | { name: 'offline' }
  | { name: 'welcome' }
  | { name: 'verify'; token: string }
  | { name: 'home'; profile: Profile };

function verifyTokenFromUrl(): string | null {
  if (typeof window === 'undefined' || window.location.pathname !== '/auth/verify') return null;
  return new URLSearchParams(window.location.search).get('token');
}

export function App({ apiUrl }: { apiUrl: string }) {
  const { t } = useTranslation();
  const api = useMemo(() => createApi(apiUrl), [apiUrl]);
  const [view, setView] = useState<View>(() => {
    const token = verifyTokenFromUrl();
    return token ? { name: 'verify', token } : { name: 'loading' };
  });

  /** Asks the API who we are; state only changes once it answers. */
  const fetchMe = useCallback(() => {
    api
      .me()
      .then((profile) => setView({ name: 'home', profile }))
      .catch((err) =>
        setView(
          err instanceof ApiError && err.status === 401 ? { name: 'welcome' } : { name: 'offline' },
        ),
      );
  }, [api]);

  const load = useCallback(() => {
    setView({ name: 'loading' });
    fetchMe();
  }, [fetchMe]);

  const initialView = useRef(view.name);
  useEffect(() => {
    // The first view is already 'loading' unless we landed on a magic link.
    if (initialView.current === 'loading') fetchMe();
  }, [fetchMe]);

  const afterVerify = useCallback(
    (p: Profile | null) => {
      // Drop the single-use token from the address bar and history.
      window.history.replaceState(null, '', '/');
      if (p) setView({ name: 'home', profile: p });
      else load();
    },
    [load],
  );

  return (
    <main className="shell">
      <h1 className="logo">nyrgo</h1>
      {view.name === 'loading' && <p role="status">{t('loading')}</p>}
      {view.name === 'offline' && (
        <div className="stack">
          <p role="alert">{t('offline')}</p>
          <button type="button" onClick={load}>
            {t('retry')}
          </button>
        </div>
      )}
      {view.name === 'welcome' && (
        <Welcome api={api} onSignedIn={(profile) => setView({ name: 'home', profile })} />
      )}
      {view.name === 'verify' && <Verify api={api} token={view.token} onDone={afterVerify} />}
      {view.name === 'home' && (
        <Home
          api={api}
          profile={view.profile}
          onChange={(profile) => setView({ name: 'home', profile })}
          onSignedOut={() => setView({ name: 'welcome' })}
        />
      )}
    </main>
  );
}
