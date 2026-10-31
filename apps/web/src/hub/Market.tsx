import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FURNITURE_BY_ID, ITEMS_BY_ID } from '@nyrgo/shared';
import { ApiError, type Api, type FurnitureInfo, type MarketInfo } from '../api';

/**
 * Mira's stall: the players' market (game items for Gold, a small fee kept by the game) and the
 * furniture she sells for houses. Creatures and NFTs are not sold here: they have their own market.
 */

const errorKey = (e: unknown) => (e instanceof ApiError ? `errors.${e.code}` : 'errors.other');
const newKey = () => crypto.randomUUID();

export function MarketPanel({ api }: { api: Api }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const [tab, setTab] = useState<'buy' | 'sell' | 'furniture'>('buy');
  const [info, setInfo] = useState<MarketInfo | null>(null);
  const [furn, setFurn] = useState<FurnitureInfo | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // a purchase keeps its key until it succeeds, so a retry after a dropped answer is not paid twice
  const [keys] = useState(() => new Map<string, string>());
  const itemName = (id: string) => ITEMS_BY_ID.get(id)?.name[lang] ?? id;

  // bumped after every change to fetch the stall again
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([api.hubMarket(), api.hubFurniture()])
      .then(([m, f]) => {
        if (!live) return;
        setInfo(m);
        setFurn(f);
      })
      .catch((e) => live && setMsg({ ok: false, text: t(errorKey(e)) }));
    return () => {
      live = false;
    };
  }, [api, t, version]);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      keys.delete(id);
      setMsg({ ok: true, text: ok });
      setVersion((v) => v + 1);
    } catch (e) {
      setMsg({ ok: false, text: t(errorKey(e)) });
    } finally {
      setBusy(null);
    }
  }
  const keyFor = (id: string) => {
    if (!keys.has(id)) keys.set(id, newKey());
    return keys.get(id)!;
  };

  if (!info || !furn) return <p className="muted">{msg ? msg.text : t('loading')}</p>;
  return (
    <div className="stack">
      <p className="muted small">{t('townMarket.gold', { gold: info.gold })}</p>
      <div className="hub-tabs" role="tablist">
        {(['buy', 'sell', 'furniture'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? '' : 'secondary'}
            onClick={() => setTab(k)}
          >
            {t(`townMarket.tab.${k}`)}
          </button>
        ))}
      </div>
      {msg && (
        <p className={msg.ok ? 'notice' : 'error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      {tab === 'buy' &&
        (info.listings.length ? (
          <ul className="hub-list">
            {info.listings.map((l) => (
              <li key={l.id}>
                <span>
                  <strong>
                    {l.qty} × {itemName(l.itemId)}
                  </strong>
                  <span className="muted small"> · {l.seller}</span>
                </span>
                <button
                  type="button"
                  className="small"
                  disabled={busy !== null || info.gold < l.price}
                  onClick={() =>
                    void run(
                      l.id,
                      () => api.hubBuyListing(l.id, keyFor(l.id)),
                      t('townMarket.bought', { item: itemName(l.itemId), qty: l.qty }),
                    )
                  }
                >
                  {t('townMarket.buyFor', { price: l.price })}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('townMarket.empty')}</p>
        ))}

      {tab === 'sell' && (
        <SellForm
          info={info}
          itemName={itemName}
          busy={busy !== null}
          onList={(item, qty, price) =>
            run('list', () => api.hubList(item, qty, price), t('townMarket.listed'))
          }
          onWithdraw={(id) => run(id, () => api.hubWithdraw(id), t('townMarket.withdrawn'))}
        />
      )}

      {tab === 'furniture' && (
        <>
          <p className="small">{t('townMarket.furnitureWhy')}</p>
          <ul className="hub-furniture">
            {furn.catalog.map((f) => {
              const def = FURNITURE_BY_ID.get(f.id);
              return (
                <li key={f.id}>
                  <img src={`/hub/f-${f.id}.webp`} alt="" loading="lazy" />
                  <span className="small">{def?.name[lang] ?? f.id}</span>
                  {furn.owned[f.id] ? (
                    <span className="muted small">
                      {t('townMarket.owned', { n: furn.owned[f.id] })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="small secondary"
                    disabled={busy !== null || furn.gold < f.price}
                    onClick={() =>
                      void run(
                        `f:${f.id}`,
                        () => api.hubBuyFurniture(f.id, keyFor(`f:${f.id}`)),
                        t('townMarket.boughtFurniture', { item: def?.name[lang] ?? f.id }),
                      )
                    }
                  >
                    {t('townMarket.buyFor', { price: f.price })}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function SellForm({
  info,
  itemName,
  busy,
  onList,
  onWithdraw,
}: {
  info: MarketInfo;
  itemName: (id: string) => string;
  busy: boolean;
  onList: (item: string, qty: number, price: number) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [item, setItem] = useState(info.items[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(50);
  const have = info.items.find((i) => i.id === item)?.qty ?? 0;
  const fee = price < 2 ? 0 : Math.max(1, Math.floor(price * info.fee));
  const open = info.mine.filter((l) => l.status === 'open');

  function submit(e: FormEvent) {
    e.preventDefault();
    void onList(item, qty, price);
  }

  return (
    <>
      {info.items.length ? (
        <form className="stack" onSubmit={submit}>
          <label>
            {t('townMarket.item')}
            <select value={item} onChange={(e) => setItem(e.target.value)}>
              {info.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {itemName(i.id)} ({i.qty})
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <label>
              {t('townMarket.qty')}
              <input
                type="number"
                min={1}
                max={Math.min(99, have)}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label>
              {t('townMarket.price')}
              <input
                type="number"
                min={1}
                max={10000}
                value={price}
                onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          </div>
          <p className="muted small">
            {t('townMarket.youGet', {
              gold: price - fee,
              fee,
              pct: Math.round(info.fee * 100),
              hours: info.hours,
            })}
          </p>
          <button type="submit" disabled={busy || qty > have || open.length >= info.maxListings}>
            {t('townMarket.list')}
          </button>
        </form>
      ) : (
        <p className="muted">{t('townMarket.nothingToSell')}</p>
      )}
      {info.mine.length > 0 && (
        <>
          <h3>{t('townMarket.mine')}</h3>
          <ul className="hub-list">
            {info.mine.map((l) => (
              <li key={l.id}>
                <span>
                  {l.qty} × {itemName(l.itemId)} · {l.price}{' '}
                  <span className="muted small">
                    {t(`townMarket.status.${l.status ?? 'open'}`)}
                  </span>
                </span>
                {l.status === 'open' && (
                  <button
                    type="button"
                    className="small secondary"
                    disabled={busy}
                    onClick={() => void onWithdraw(l.id)}
                  >
                    {t('townMarket.withdraw')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
