import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './app.css';

type ServerState = 'checking' | 'ok' | 'down';

export function App({ apiUrl }: { apiUrl: string }) {
  const { t } = useTranslation();
  const [server, setServer] = useState<ServerState>('checking');

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${apiUrl}/health`, { signal: ctrl.signal })
      .then((r) => setServer(r.ok ? 'ok' : 'down'))
      .catch(() => {
        if (!ctrl.signal.aborted) setServer('down');
      });
    return () => ctrl.abort();
  }, [apiUrl]);

  const label =
    server === 'ok' ? t('serverOk') : server === 'down' ? t('serverDown') : t('checking');

  return (
    <main className="shell">
      <h1 className="logo">nyrgo</h1>
      <p className="tagline">{t('tagline')}</p>
      <p className="safety" role="note">
        {t('safety')}
      </p>
      <p className="status" data-state={server}>
        <span className="dot" aria-hidden="true" />
        {t('server')}: {label}
      </p>
      <p className="phase">{t('phase')}</p>
    </main>
  );
}
