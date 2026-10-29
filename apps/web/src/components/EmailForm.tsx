import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api } from '../api';

export function EmailForm({ api, title, hint }: { api: Api; title: string; hint?: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      await api.requestLink(email);
      setState('sent');
    } catch {
      setState('error');
    }
  }

  return (
    <section className="card" aria-labelledby="email-title">
      <h2 id="email-title">{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {state === 'sent' ? (
        <p role="status">{t('linkSent')}</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <label>
            {t('email')}
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" disabled={state === 'sending'}>
            {t('sendLink')}
          </button>
          {state === 'error' && <p role="alert">{t('error')}</p>}
        </form>
      )}
    </section>
  );
}
