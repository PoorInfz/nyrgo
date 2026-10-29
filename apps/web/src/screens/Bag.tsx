import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type InventoryItem, type Profile } from '../api';
import { useContent } from '../content';

type Lang = 'es' | 'en';

function newKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** The player's items, the shop (Gold) and the workshop (recipes). */
export function Bag({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { dex } = useContent(api);
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [me, setMe] = useState<Pick<Profile, 'gold' | 'level'> | null>(null);
  const [shop, setShop] = useState<{ id: string; price: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** Kept across a retry after a lost connection so a purchase is never paid twice. */
  const pending = useRef<{ what: string; key: string } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.inventory(), api.me(), api.shop()])
      .then(([inv, profile, s]) => {
        if (!live) return;
        setItems(inv.items);
        setMe({ gold: profile.gold, level: profile.level });
        setShop(s.items);
      })
      .catch(() => live && setMessage({ ok: false, text: t('offline') }));
    return () => {
      live = false;
    };
  }, [api, t]);

  if (!dex || !items || !me) return <p role="status">{t('loading')}</p>;

  const name = (id: string) => dex.items.find((i) => i.id === id)?.name[lang] ?? id;
  const qty = (id: string) => items.find((i) => i.id === id)?.qty ?? 0;

  async function run(
    what: string,
    call: (key: string) => Promise<{ gold: number; items: InventoryItem[] }>,
    done: string,
  ) {
    if (pending.current?.what !== what) pending.current = { what, key: newKey() };
    setBusy(true);
    setMessage(null);
    try {
      const r = await call(pending.current.key);
      pending.current = null;
      setItems(r.items);
      setMe((m) => (m ? { ...m, gold: r.gold } : m));
      setMessage({ ok: true, text: done });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'network')) pending.current = null;
      const code = err instanceof ApiError ? err.code : 'other';
      setMessage({ ok: false, text: t(`errors.${code}`, { defaultValue: t('errors.other') }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="bag-title">
        <h2 id="bag-title">{t('bag.title')}</h2>
        <p className="gold-line">{t('bag.gold', { gold: me.gold })}</p>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'notice' : ''}>
            {message.text}
          </p>
        )}
        {items.length === 0 ? (
          <p className="muted">{t('bag.empty')}</p>
        ) : (
          <ul className="item-list">
            {items.map((i) => (
              <li key={i.id}>
                <span>{name(i.id)}</span>
                <span className="muted">×{i.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="shop-title">
        <h2 id="shop-title">{t('bag.shop')}</h2>
        <ul className="item-list">
          {shop.map((s) => (
            <li key={s.id}>
              <span>
                {name(s.id)}{' '}
                <span className="muted small">{t('bag.price', { price: s.price })}</span>
              </span>
              <span className="row tight">
                {[1, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="secondary small"
                    disabled={busy || me.gold < s.price * n}
                    onClick={() =>
                      run(
                        `buy:${s.id}:${n}`,
                        (key) => api.buy(s.id, n, key),
                        t('bag.bought', { count: n, item: name(s.id) }),
                      )
                    }
                  >
                    {t('bag.buy', { count: n })}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="craft-title">
        <h2 id="craft-title">{t('bag.workshop')}</h2>
        <ul className="plain stack">
          {dex.recipes.map((r) => {
            const locked = me.level < r.unlockLevel;
            const enough =
              Object.entries(r.inputs).every(([id, n]) => qty(id) >= n) && me.gold >= r.gold;
            return (
              <li key={r.id} className="recipe">
                <strong>{name(r.output)}</strong>
                <span className="muted small">
                  {Object.entries(r.inputs)
                    .map(([id, n]) => `${n} × ${name(id)} (${qty(id)})`)
                    .join(' · ')}
                  {` · ${t('bag.price', { price: r.gold })}`}
                </span>
                <button
                  type="button"
                  className="secondary small"
                  disabled={busy || locked || !enough}
                  onClick={() =>
                    run(
                      `craft:${r.id}`,
                      (key) => api.craft(r.id, key),
                      t('bag.crafted', { item: name(r.output) }),
                    )
                  }
                >
                  {locked ? t('bag.unlockAt', { level: r.unlockLevel }) : t('bag.craft')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
