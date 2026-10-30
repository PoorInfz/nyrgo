import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type Profile } from '../api';
import { EmailForm } from '../components/EmailForm';
import { TipsCard } from './TipsCard';
import { NearWallet } from './NearWallet';
import { Wardrobe } from './Wardrobe';

export function Home({
  api,
  profile,
  onChange,
  onSignedOut,
}: {
  api: Api;
  profile: Profile;
  onChange: (p: Profile) => void;
  onSignedOut: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(profile.displayName);
  const [message, setMessage] = useState<string | null>(null);

  async function rename(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      onChange(await api.rename(name));
    } catch {
      setMessage(t('error'));
    }
  }

  async function exportData() {
    setMessage(null);
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nyrgo-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage(t('error'));
    }
  }

  async function logout() {
    if (profile.kind === 'guest' && !window.confirm(t('guestLogoutWarning'))) return;
    await api.logout().catch(() => undefined);
    onSignedOut();
  }

  async function remove() {
    if (!window.confirm(t('deleteConfirm'))) return;
    setMessage(null);
    try {
      await api.deleteAccount();
      onSignedOut();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.code === 'reauth_required' ? t('reauth') : t('error'),
      );
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <p className="badge">{profile.kind === 'guest' ? t('guest') : t('registered')}</p>
        <h2 className="name">{profile.displayName}</h2>
        <dl className="stats">
          <div>
            <dt>{t('level')}</dt>
            <dd>{profile.level}</dd>
          </div>
          <div>
            <dt>{t('xp')}</dt>
            <dd>{profile.xp}</dd>
          </div>
          <div>
            <dt>{t('gold')}</dt>
            <dd>{profile.gold}</dd>
          </div>
        </dl>
      </section>

      <section className="card stack" aria-labelledby="wardrobe-title">
        <h2 id="wardrobe-title">{t('wardrobe.title')}</h2>
        <p className="muted">{t('wardrobe.why')}</p>
        <Wardrobe api={api} onGold={(gold) => onChange({ ...profile, gold })} />
      </section>

      {profile.kind === 'guest' && (
        <EmailForm api={api} title={t('saveTitle')} hint={t('saveHint')} />
      )}

      <form className="card stack" onSubmit={rename}>
        <label>
          {t('rename')}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[\p{L}\p{N}_\-]{3,24}"
            title={t('renameHint')}
            required
          />
        </label>
        <button type="submit">{t('save')}</button>
      </form>

      {profile.canUseWeb3 && <NearWallet api={api} />}
      {profile.canUseWeb3 && <TipsCard api={api} />}

      <section className="card stack" aria-labelledby="privacy-title">
        <h2 id="privacy-title">{t('privacy')}</h2>
        <button type="button" onClick={exportData}>
          {t('exportData')}
        </button>
        <button type="button" onClick={logout}>
          {t('logout')}
        </button>
        <button type="button" className="danger" onClick={remove}>
          {t('deleteAccount')}
        </button>
      </section>

      {message && <p role="alert">{message}</p>}
    </div>
  );
}
