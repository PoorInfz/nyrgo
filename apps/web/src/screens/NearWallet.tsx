import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type NearChallenge, type NearLink } from '../api';

/** What a wallet returns after signing (NEP-413). */
export interface SignedNearMessage {
  accountId: string;
  publicKey: string;
  signature: string;
}

/** Opens the player's wallet and asks it to sign the challenge. Swappable in tests. */
export type NearSigner = (challenge: NearChallenge) => Promise<SignedNearMessage>;

/**
 * The real signer: the NEAR wallet selector (@hot-labs/near-connect), in its own chunk and run
 * only when the player taps the button: until then nothing contacts any wallet or NEAR service.
 */
export const connectorSigner: NearSigner = async (challenge) => {
  const { NearConnector } = await import('@hot-labs/near-connect');
  const connector = new NearConnector({
    network: challenge.network,
    features: { signMessage: true, [challenge.network]: true },
  });
  const wallet = await connector.connect();
  try {
    return await wallet.signMessage({
      message: challenge.message,
      recipient: challenge.recipient,
      nonce: Uint8Array.from(atob(challenge.nonce), (c) => c.charCodeAt(0)),
      network: challenge.network,
    });
  } finally {
    // the game keeps no wallet session; the link lives on the server
    void connector.disconnect(wallet).catch(() => undefined);
  }
};

/**
 * Link a NEAR account by signing a message. Adults only (the parent hides it otherwise); testnet,
 * so no real money moves. The game never asks for a seed phrase or a private key.
 */
export function NearWallet({ api, signer = connectorSigner }: { api: Api; signer?: NearSigner }) {
  const { t } = useTranslation();
  const [link, setLink] = useState<NearLink | null | undefined>(undefined);
  const [network, setNetwork] = useState('testnet');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    api
      .nearStatus()
      .then((s) => {
        if (!live) return;
        setLink(s.wallet);
        setNetwork(s.network);
      })
      .catch(() => live && setLink(null));
    return () => {
      live = false;
    };
  }, [api]);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      const challenge = await api.nearChallenge();
      const signed = await signer(challenge);
      const res = await api.nearLink({
        accountId: signed.accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
      });
      setLink(res.wallet);
      setMessage({ ok: true, text: t('near.linked', { account: res.wallet.accountId }) });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setMessage({
        ok: false,
        text: code ? t(`errors.${code}`, { defaultValue: t('near.failed') }) : t('near.cancelled'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await api.nearUnlink();
      setLink(null);
      setMessage({ ok: true, text: t('near.unlinked') });
    } catch {
      setMessage({ ok: false, text: t('near.failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="near-title">
      <h2 id="near-title">{t('near.title')}</h2>
      <p className="badge">{t('near.network', { network })}</p>
      {link === undefined && <p role="status">{t('loading')}</p>}
      {link && (
        <p>
          {t('near.account')} <strong className="account-id">{link.accountId}</strong>
        </p>
      )}
      {link === null && <p className="muted">{t('near.why')}</p>}
      <p className="safety">{t('near.safety')}</p>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'notice' : ''}>
          {message.text}
        </p>
      )}
      {link === null && (
        <button type="button" onClick={connect} disabled={busy}>
          {busy ? t('near.waiting') : t('near.connect')}
        </button>
      )}
      {link && (
        <button type="button" className="secondary" onClick={unlink} disabled={busy}>
          {t('near.unlink')}
        </button>
      )}
    </section>
  );
}
