import { useCallback, useEffect, useState } from 'react';
import { Market } from './Market';
import {
  connectorCaller,
  nearToYocto,
  WrongAccountError,
  yoctoToNear,
  type NearCaller,
} from '../near/tx';

/** 0.01 NEAR held while listed (returned when the listing ends), and gas for each call. */
const LISTING_DEPOSIT = '10000000000000000000000';
const GAS_LIST = '30000000000000';
const GAS_BUY = '100000000000000';
import { useTranslation } from 'react-i18next';
import { CREATURES_BY_ID, evolutionBlock, nftGrade, type Evolution } from '@nyrgo/shared';
import {
  ApiError,
  type Api,
  type Market as MarketData,
  type MarketListing,
  type OwnedCreature,
} from '../api';
import { cutUrl, useContent } from '../content';

type Lang = 'es' | 'en';

/** The player's creatures; a new player first picks one of the three starters. */
export function Collection({ api, caller = connectorCaller }: { api: Api; caller?: NearCaller }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const { dex, failed } = useContent(api);
  const [mine, setMine] = useState<OwnedCreature[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  /** The linked NEAR account when this player can take creatures out as NFTs. */
  const [nftAccount, setNftAccount] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  /** Prices typed for creatures about to be put on sale, by creature id. */
  const [prices, setPrices] = useState<Record<string, string>>({});

  const reload = useCallback(
    () =>
      api
        .myCreatures()
        .then((r) => {
          // the moment the list was loaded: used for "days in your collection"
          setLoadedAt(Date.now());
          setMine(r.creatures);
        })
        .catch(() => setError(true)),
    [api],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    let live = true;
    // both answer with an error for minors, without a wallet or with NFTs off: no button then
    Promise.all([api.nftInfo(), api.nearStatus()])
      .then(([, s]) => live && setNftAccount(s.wallet?.accountId ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);

  const loadMarket = useCallback(
    () =>
      api
        .market()
        // an older API or one with NFTs off answers something else: no market then
        .then((m) => setMarket(Array.isArray(m?.listings) ? m : null))
        .catch(() => setMarket(null)),
    [api],
  );
  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  if (failed || error) return <p role="alert">{t('offline')}</p>;
  if (!dex || !mine) return <p role="status">{t('loading')}</p>;

  const byId = new Map(dex.creatures.map((c) => [c.id, c]));
  const elements = new Map(dex.elements.map((e) => [e.id, e]));

  async function heal(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      const healed = await api.heal(id, 'patch');
      setMine((all) => all?.map((m) => (m.id === id ? { ...m, hp: healed.hp } : m)) ?? all);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setNotice(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  async function evolve(m: OwnedCreature, from: string, to: string) {
    if (!window.confirm(t('evolveConfirm', { from, to }))) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.evolve(m.id);
      setMine((all) => all?.map((x) => (x.id === m.id ? r.creature : x)) ?? all);
      setNotice(t('evolved', { from, to }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setNotice(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  async function mint(m: OwnedCreature, name: string) {
    if (!nftAccount || !window.confirm(t('nft.confirm', { name, account: nftAccount }))) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.mintCreature(m.id);
      if (r.creature) setMine((all) => all?.map((x) => (x.id === m.id ? r.creature! : x)) ?? all);
      setNotice(t('nft.minted', { name, account: nftAccount }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'other';
      setNotice(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  /** A call signed by the player's wallet; the market reloads after it. */
  async function signed(
    methodName: string,
    args: object,
    deposit: string,
    gas: string,
    done: string,
  ): Promise<boolean> {
    if (!nftAccount || !market) return false;
    setBusy(true);
    setNotice(null);
    try {
      await caller({
        network: market.network,
        signerId: nftAccount,
        receiverId: market.contractId,
        methodName,
        args,
        deposit,
        gas,
      });
      setNotice(done);
      return true;
    } catch (err) {
      setNotice(
        err instanceof WrongAccountError
          ? t('market.wrongAccount', { account: err.expected })
          : t('market.failed'),
      );
      return false;
    } finally {
      setBusy(false);
      await loadMarket();
    }
  }

  async function sell(m: OwnedCreature, name: string) {
    const price = nearToYocto(prices[m.id] ?? '');
    if (!price) {
      setNotice(t('market.badPrice'));
      return;
    }
    if (!window.confirm(t('market.sellConfirm', { name, price: yoctoToNear(price) }))) return;
    await signed(
      'market_list',
      { token_id: m.id, price },
      LISTING_DEPOSIT,
      GAS_LIST,
      t('market.listed', { name }),
    );
  }

  async function unlist(m: OwnedCreature, name: string) {
    await signed(
      'market_unlist',
      { token_id: m.id },
      '1',
      GAS_LIST,
      t('market.unlisted', { name }),
    );
  }

  async function buy(l: MarketListing, name: string) {
    if (!window.confirm(t('market.buyConfirm', { name, price: yoctoToNear(l.priceYocto) }))) return;
    if (
      await signed(
        'market_buy',
        { token_id: l.tokenId },
        l.priceYocto,
        GAS_BUY,
        t('market.bought', { name }),
      )
    ) {
      // the creature follows its token: give the chain a moment, then refresh the collection
      setTimeout(() => void reload(), 4000);
    }
  }

  async function pick(id: string, name: string) {
    if (!window.confirm(t('starterConfirm', { name }))) return;
    setBusy(true);
    await api.pickStarter(id).catch(() => undefined);
    await reload();
    setBusy(false);
  }

  if (mine.length === 0) {
    const starters = dex.creatures.filter((c) => c.starter);
    return (
      <section className="stack" aria-labelledby="starter-title">
        <h2 id="starter-title">{t('starterTitle')}</h2>
        <p className="muted">{t('starterWhy')}</p>
        <ul className="plain stack">
          {starters.map((c) => (
            <li key={c.id} className="card starter">
              <img src={c.art} alt="" width={120} height={174} />
              <div className="stack">
                <h3>{c.name}</h3>
                <p>
                  <span className="chip" style={{ background: elements.get(c.element)!.color }}>
                    {elements.get(c.element)!.name[lang]}
                  </span>
                </p>
                <p className="muted">{c.lore[lang]}</p>
                <button type="button" disabled={busy} onClick={() => pick(c.id, c.name)}>
                  {t('pickStarter', { name: c.name })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="stack" aria-labelledby="col-title">
      <h2 id="col-title">{t('collectionTitle')}</h2>
      <p className="muted">{t('collectionCount', { count: mine.length })}</p>
      {notice && <p role="status">{notice}</p>}
      <ul className="dex-grid">
        {mine.map((m) => {
          const def = byId.get(m.creatureId);
          return (
            <li key={m.id}>
              <div className="dex-card owned">
                <span className="pic">
                  <img src={cutUrl(m.creatureId)} alt="" width={112} height={128} />
                </span>
                {m.onchain && (
                  <span className="nft-badge">
                    {m.onchain.status === 'minted'
                      ? m.onchain.edition
                        ? t('nft.edition', { n: m.onchain.edition, of: m.onchain.supply })
                        : t('nft.badge')
                      : t('nft.minting')}
                  </span>
                )}
                <span
                  className={`grade grade-${nftGrade(m.ivs)}`}
                  title={t('nft.gradeHint')}
                  aria-label={t('nft.grade', { grade: nftGrade(m.ivs) })}
                >
                  {nftGrade(m.ivs)}
                </span>
                <span className="dex-name">{def?.name ?? m.creatureId}</span>
                <span className="muted">
                  {t('levelShort', { level: m.level })} · {t(`caughtVia.${m.acquiredVia}`)}
                </span>
                <div className="hp" role="img" aria-label={t('hpLine', { hp: m.hp, max: m.maxHp })}>
                  <span
                    className={m.hp / m.maxHp <= 0.25 ? 'hp-fill low' : 'hp-fill'}
                    style={{ width: `${Math.round((m.hp / m.maxHp) * 100)}%` }}
                  />
                </div>
                <span className="muted small">
                  {t('hpLine', { hp: m.hp, max: m.maxHp })} · {t('stat.atk')} {m.stats.atk} ·{' '}
                  {t('stat.def')} {m.stats.def} · {t('stat.spd')} {m.stats.spd}
                </span>
                {def?.evolution && !m.onchain && (
                  <EvolveButton
                    m={m}
                    evo={def.evolution}
                    from={def.name}
                    to={byId.get(def.evolution.to)?.name ?? def.evolution.to}
                    busy={busy}
                    now={loadedAt}
                    onEvolve={evolve}
                  />
                )}
                {m.hp < m.maxHp && (
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy}
                    onClick={() => heal(m.id)}
                  >
                    {t('healWith', { item: dex.items.find((i) => i.id === 'patch')!.name[lang] })}
                  </button>
                )}
                {nftAccount && !m.onchain && (
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy}
                    onClick={() => mint(m, def?.name ?? m.creatureId)}
                  >
                    {t('nft.mint')}
                  </button>
                )}
                {m.onchain?.account && (
                  <span className="muted small account-id">
                    {t('nft.heldBy', { account: m.onchain.account })}
                  </span>
                )}
                {m.onchain?.status === 'minted' && (
                  <a href={api.nftCardUrl(m.id)} target="_blank" rel="noopener" className="small">
                    {t('nft.card')}
                  </a>
                )}
                {market &&
                  nftAccount &&
                  m.onchain?.status === 'minted' &&
                  m.onchain.account === nftAccount && (
                    <SellControls
                      listing={market.listings.find((l) => l.tokenId === m.id) ?? null}
                      price={prices[m.id] ?? ''}
                      busy={busy}
                      onPrice={(v) => setPrices((p) => ({ ...p, [m.id]: v }))}
                      onSell={() => sell(m, def?.name ?? m.creatureId)}
                      onUnlist={() => unlist(m, def?.name ?? m.creatureId)}
                    />
                  )}
              </div>
            </li>
          );
        })}
      </ul>
      {market && (
        <Market
          market={market}
          names={new Map(dex.creatures.map((c) => [c.id, c.name]))}
          account={nftAccount}
          busy={busy}
          onBuy={buy}
        />
      )}
    </section>
  );
}

/** Put a creature NFT on sale in the game's market, or take it off. */
function SellControls({
  listing,
  price,
  busy,
  onPrice,
  onSell,
  onUnlist,
}: {
  listing: MarketListing | null;
  price: string;
  busy: boolean;
  onPrice: (v: string) => void;
  onSell: () => void;
  onUnlist: () => void;
}) {
  const { t } = useTranslation();
  if (listing) {
    return (
      <span className="stack small">
        <span>{t('market.onSale', { price: yoctoToNear(listing.priceYocto) })}</span>
        <button type="button" className="secondary small" disabled={busy} onClick={onUnlist}>
          {t('market.unlist')}
        </button>
      </span>
    );
  }
  return (
    <span className="sell">
      <label>
        <span className="sr-only">{t('market.priceLabel')}</span>
        <input
          inputMode="decimal"
          placeholder="NEAR"
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          aria-label={t('market.priceLabel')}
        />
      </label>
      <button type="button" className="secondary small" disabled={busy || !price} onClick={onSell}>
        {t('market.sell')}
      </button>
    </span>
  );
}

function EvolveButton({
  m,
  evo,
  from,
  to,
  busy,
  now,
  onEvolve,
}: {
  m: OwnedCreature;
  evo: Evolution;
  from: string;
  to: string;
  busy: boolean;
  now: number;
  onEvolve: (m: OwnedCreature, from: string, to: string) => void;
}) {
  const { t } = useTranslation();
  const heldDays = (now - Date.parse(m.acquiredAt)) / 86_400_000;
  const block = evolutionBlock(CREATURES_BY_ID.get(m.creatureId)!, m.level, heldDays);
  if (block === 'level') {
    return <span className="muted small">{t('evolveAtLevel', { to, level: evo.level })}</span>;
  }
  if (block === 'hold_days') {
    return (
      <span className="muted small">
        {t('evolveAfterDays', { to, days: Math.ceil((evo.holdDays ?? 0) - heldDays) })}
      </span>
    );
  }
  const materials = Object.entries(evo.materials)
    .map(([id, n]) => `${n} ${t(`material.${id}`)}`)
    .join(' · ');
  return (
    <button type="button" className="small" disabled={busy} onClick={() => onEvolve(m, from, to)}>
      {t('evolveTo', { to })}
      <span className="small">
        {' '}
        ({evo.gold} Gold · {materials})
      </span>
    </button>
  );
}
