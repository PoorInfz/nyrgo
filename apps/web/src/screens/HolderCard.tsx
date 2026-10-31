import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type HolderState } from '../api';

/**
 * The nyrGo! test token rank (testnet, no value): the balance last read from the linked NEAR
 * account, the rank in force (the smallest balance of the last days), when a higher one starts
 * counting, and what each rank gives. Adults only (the parent hides it otherwise).
 */
export function HolderCard({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<HolderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .holder()
      .then((x) => live && setS(x))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, [api]);

  if (!s || !s.contract) return null;
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const num = (n: number) => n.toLocaleString(i18n.language);
  const share = (amount: number) =>
    `${((amount / 1_000_000_000) * 100).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} %`;
  const name = (id: string) => {
    const tier = s.tiers.find((x) => x.id === id)!;
    return t('holder.rank', { n: s.tiers.indexOf(tier) + 1, share: share(tier.amount) });
  };

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setS(await api.refreshHolder());
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'other';
      setError(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack holder-card" aria-labelledby="holder-title">
      <h2 id="holder-title">{t('holder.title', { symbol: s.symbol })}</h2>
      <p className="muted">{t('holder.why', { hours: s.holdHours, network: s.network })}</p>

      {!s.account ? (
        <p>{t('holder.noAccount')}</p>
      ) : (
        <>
          <p>
            {s.balance === null
              ? t('holder.notRead')
              : t('holder.balance', { n: num(s.balance), symbol: s.symbol })}
            {s.checkedAt && (
              <span className="muted"> · {t('holder.checked', { when: when(s.checkedAt) })}</span>
            )}
          </p>
          <p className="holder-now">
            {s.tier ? t('holder.current', { rank: name(s.tier) }) : t('holder.none')}
          </p>
          {s.next && (
            <p className="muted">
              {t('holder.next', { rank: name(s.next.tier), when: when(s.next.countsAt) })}
            </p>
          )}
          {s.stale && <p className="muted">{t('holder.stale')}</p>}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? t('loading') : t('holder.refresh')}
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      )}

      <table className="holder-tiers">
        <caption className="sr-only">{t('holder.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('holder.colRank')}</th>
            <th scope="col">{t('holder.colAmount', { symbol: s.symbol })}</th>
            <th scope="col">{t('holder.colPerks')}</th>
          </tr>
        </thead>
        <tbody>
          {s.tiers.map((x) => (
            <tr key={x.id} className={x.id === s.tier ? 'on' : undefined}>
              <th scope="row">{name(x.id)}</th>
              <td>{num(x.amount)}</td>
              <td>
                {t('holder.boost', { pct: x.tipBoostPct })}
                {x.outfits && <> · {t('holder.outfits')}</>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('holder.note')}</p>
    </section>
  );
}
