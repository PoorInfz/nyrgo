import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api, type Profile } from '../api';
import { EmailForm } from '../components/EmailForm';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function Welcome({ api, onSignedIn }: { api: Api; onSignedIn: (p: Profile) => void }) {
  const { t, i18n } = useTranslation();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - 10 - i);
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [mode, setMode] = useState<'age' | 'login'>('age');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const monthName = (m: number) =>
    new Date(2000, m - 1, 1).toLocaleDateString(i18n.language, { month: 'long' });

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onSignedIn(await api.createGuest(Number(year), Number(month)));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'age_restricted' ? t('ageRestricted') : t('error'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'login') {
    return (
      <div className="stack">
        <EmailForm api={api} title={t('loginTitle')} />
        <button type="button" className="link" onClick={() => setMode('age')}>
          {t('back')}
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="tagline">{t('tagline')}</p>
      <p className="safety" role="note">
        {t('safety')}
      </p>
      <form className="card stack" onSubmit={start} aria-labelledby="age-title">
        <h2 id="age-title">{t('ageTitle')}</h2>
        <p className="muted">{t('ageHint')}</p>
        <div className="row">
          <label>
            {t('month')}
            <select required value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="" />
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('year')}
            <select required value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="" />
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={busy}>
          {t('start')}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <button type="button" className="link" onClick={() => setMode('login')}>
        {t('haveAccount')}
      </button>
    </div>
  );
}
