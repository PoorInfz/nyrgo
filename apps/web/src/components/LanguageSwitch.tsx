import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

/** The game's language, chosen from a list that grows as translations are added. */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const current = LANGUAGES.find((l) => i18n.language.startsWith(l.code))?.code ?? 'en';
  return (
    <label className="lang-switch">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3Z" />
      </svg>
      <span className="sr-only">{t('language')}</span>
      <select value={current} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
