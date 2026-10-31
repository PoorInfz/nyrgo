import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api } from '../api';

/**
 * Whether this player's catches appear on the website's world globe (approximate area, name
 * masked). Adults only; turning it off also deletes the marks already shown.
 */
export function GlobeToggle({ api }: { api: Api }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ on: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .privacy()
      .then((p) => live && setState({ on: p.showOnGlobe, available: p.globeAvailable }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);

  // under-18s never appear on the globe: nothing to choose
  if (!state?.available) return null;

  async function change(on: boolean) {
    setBusy(true);
    setSaved(null);
    try {
      const r = await api.setPrivacy(on);
      setState((s) => (s ? { ...s, on: r.showOnGlobe } : s));
      setSaved(on ? t('globe.savedOn') : t('globe.savedOff'));
    } catch {
      setSaved(t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={state.on}
          disabled={busy}
          onChange={(e) => void change(e.target.checked)}
        />
        <span>
          <strong>{t('globe.label')}</strong>
          <span className="muted small">{t('globe.why')}</span>
        </span>
      </label>
      {saved && (
        <p className="muted small" role="status">
          {saved}
        </p>
      )}
    </div>
  );
}
