import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type Api } from '../api';

type Category = 'bug' | 'idea' | 'fun' | 'other';
const CATEGORIES: { id: Category; icon: string }[] = [
  { id: 'bug', icon: '🐞' },
  { id: 'idea', icon: '💡' },
  { id: 'fun', icon: '⭐' },
  { id: 'other', icon: '💬' },
];

/**
 * The playtest's comment box: a button in the corner of every screen that opens a short form
 * (what kind of comment, and the comment). The screen it was sent from, the app version and the
 * browser go with it, never the place.
 */
export function Feedback({ api, screen }: { api: Api; screen: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.sendFeedback({
        category,
        body: body.trim(),
        screen,
        build: __BUILD__.slice(0, 40),
        lang: i18n.language.slice(0, 10),
      });
      setSent(true);
      setBody('');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'other';
      setError(t(`errors.${code}`, { defaultValue: t('errors.other') }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fb-open"
        aria-label={t('feedback.open')}
        title={t('feedback.open')}
        onClick={() => {
          setOpen(true);
          setSent(false);
          setError(null);
        }}
      >
        💬
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <section
            className="fb-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fb-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="fb-title">{t('feedback.title')}</h2>
            {sent ? (
              <>
                <p className="fb-thanks">{t('feedback.thanks')}</p>
                <div className="row">
                  <button type="button" className="secondary" onClick={() => setSent(false)}>
                    {t('feedback.another')}
                  </button>
                  <button type="button" onClick={() => setOpen(false)}>
                    {t('feedback.close')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">{t('feedback.intro')}</p>
                <div className="chips" role="radiogroup" aria-label={t('feedback.kind')}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={category === c.id}
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                    >
                      <span aria-hidden="true">{c.icon}</span> {t(`feedback.cat.${c.id}`)}
                    </button>
                  ))}
                </div>
                <label>
                  {t('feedback.label')}
                  <textarea
                    ref={box}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={1000}
                    rows={5}
                    placeholder={t(`feedback.hint.${category}`)}
                  />
                </label>
                <p className="muted small">
                  {t('feedback.privacy')} · {body.length}/1000
                </p>
                {error && <p role="alert">{error}</p>}
                <div className="row">
                  <button type="button" className="secondary" onClick={() => setOpen(false)}>
                    {t('feedback.close')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || body.trim().length < 3}
                    onClick={() => void send()}
                  >
                    {busy ? t('loading') : t('feedback.send')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
