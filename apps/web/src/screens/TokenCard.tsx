import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type TokenStatus } from '../api';

const EXPLORER = { testnet: 'https://testnet.nearblocks.io', mainnet: 'https://nearblocks.io' };

/**
 * NYRGO earned by playing and the claim to the linked NEAR account. Adults only (the parent
 * hides it otherwise). Testnet: the tokens have no value.
 */
export function TokenCard({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<TokenStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => api.token().then(setS), [api]);
  useEffect(() => {
    load().catch(() => setS(null));
  }, [load]);

  if (!s || !s.enabled) return null;

  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
      : '';
  const explorer = EXPLORER[s.network as keyof typeof EXPLORER] ?? EXPLORER.testnet;

  async function claim() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.tokenClaim();
      setMessage({ ok: true, text: t('token.claimed', { amount: r.amount, account: r.account }) });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setMessage({ ok: false, text: t(`token.errors.${code}`, t('token.errors.other')) });
    } finally {
      setBusy(false);
      await load().catch(() => undefined);
    }
  }

  return (
    <section className="card stack" aria-labelledby="token-title">
      <h2 id="token-title">{t('token.title', { symbol: s.symbol })}</h2>
      <p className="muted">{t('token.why', { network: s.network })}</p>
      <p>
        <strong className="token-balance">
          {s.balance} {s.symbol}
        </strong>{' '}
        <span className="muted">{t('token.unclaimed')}</span>
      </p>
      <p className="muted">
        {t('token.today', { earned: s.earnedToday, cap: s.dailyCap, symbol: s.symbol })}
      </p>
      <button type="button" onClick={claim} disabled={!s.canClaim || busy}>
        {busy ? t('token.sending') : t('token.claim', { symbol: s.symbol })}
      </button>
      {!s.canClaim && s.blockedBy && (
        <p className="muted">
          {t(`token.blocked.${s.blockedBy}`, {
            min: s.minClaim,
            symbol: s.symbol,
            when: when(s.claimableAt),
            defaultValue: t('token.blocked.other'),
          })}
        </p>
      )}
      {message && (
        <p role="status" className={message.ok ? 'ok' : 'error'}>
          {message.text}
        </p>
      )}
      {s.claims.length > 0 && (
        <ul className="token-claims">
          {s.claims.map((c) => (
            <li key={c.id}>
              {when(c.createdAt)} · {c.amount} {s.symbol} · {t(`token.status.${c.status}`)}
              {c.txHash && (
                <>
                  {' · '}
                  <a href={`${explorer}/txns/${c.txHash}`} target="_blank" rel="noopener">
                    {t('token.view')}
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
