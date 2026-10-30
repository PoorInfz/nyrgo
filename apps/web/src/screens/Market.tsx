import { useTranslation } from 'react-i18next';
import type { Market as MarketData, MarketListing } from '../api';
import { yoctoToNear } from '../near/tx';

/**
 * The game's market: creatures other players sell, bought with the player's own wallet. The
 * contract pays the seller and sends its fee to the treasury that funds NEAR tips.
 */
export function Market({
  market,
  names,
  account,
  busy,
  onBuy,
}: {
  market: MarketData;
  names: Map<string, string>;
  /** The linked NEAR account (adults with a wallet); without it buying is not offered. */
  account: string | null;
  busy: boolean;
  onBuy: (l: MarketListing, name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="card stack" aria-labelledby="market-title">
      <h2 id="market-title">{t('market.title')}</h2>
      <p className="muted">
        {t('market.why', { fee: market.marketFeeBps / 100, royalty: market.royaltyBps / 100 })}
      </p>
      {market.listings.length === 0 ? (
        <p className="muted">{t('market.empty')}</p>
      ) : (
        <ul className="dex-grid">
          {market.listings.map((l) => {
            const name = names.get(l.species) ?? l.species;
            const mine = l.seller === account;
            return (
              <li key={l.tokenId}>
                <div className="dex-card owned">
                  <img src={l.cardUrl} alt={name} width={150} height={220} loading="lazy" />
                  <strong>{name}</strong>
                  <span className="muted small">
                    {t('market.meta', { level: l.level, grade: l.grade })}
                    {l.edition && l.supply ? ` · #${l.edition}/${l.supply}` : ''}
                  </span>
                  <span className="price">{yoctoToNear(l.priceYocto)} NEAR</span>
                  {mine ? (
                    <span className="muted small">{t('market.yours')}</span>
                  ) : account ? (
                    <button type="button" disabled={busy} onClick={() => onBuy(l, name)}>
                      {t('market.buy', { price: yoctoToNear(l.priceYocto) })}
                    </button>
                  ) : (
                    <span className="muted small">{t('market.linkToBuy')}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
