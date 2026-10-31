import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api, MyTips } from '../api';

const EXPLORER = { testnet: 'https://testnet.nearblocks.io', mainnet: 'https://nearblocks.io' };

/**
 * NEAR tips for walking to creatures and catching them, paid from the trading fees. Adults
 * only (the parent hides it otherwise). Testnet: no real money.
 */
export function TipsCard({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<MyTips | null>(null);
  useEffect(() => {
    let live = true;
    api
      .tips()
      .then((x) => live && setS(x))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, [api]);
  if (!s || !s.enabled) return null;
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const explorer = EXPLORER[s.network as keyof typeof EXPLORER] ?? EXPLORER.testnet;
  return (
    <section className="card stack" aria-labelledby="tips-title">
      <h2 id="tips-title">{t('tips.title')}</h2>
      <p className="muted">
        {t('tips.why', {
          amount: s.rules.amountNear,
          distance: s.rules.minDistanceM,
          minutes: s.rules.minIntervalMin,
          max: s.rules.maxPerDay,
          network: s.network,
        })}
      </p>
      <p>{t('tips.today', { n: s.today, max: s.rules.maxPerDay })}</p>
      {s.nextTipAt && <p className="muted">{t('tips.next', { when: when(s.nextTipAt) })}</p>}
      {s.tips.length > 0 && (
        <ul className="token-claims">
          {s.tips.map((x) => (
            <li key={x.id}>
              {when(x.createdAt)} · {x.amountNear} NEAR
              {x.boostPct ? ` (${t('holder.boost', { pct: x.boostPct })})` : ''} ·{' '}
              {t(`tips.status.${x.status}`)}
              {x.txHash && (
                <>
                  {' · '}
                  <a href={`${explorer}/txns/${x.txHash}`} target="_blank" rel="noopener">
                    {t('tips.view')}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
