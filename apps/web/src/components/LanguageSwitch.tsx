import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

/** The game's language: a button with the current flag that opens the list of languages. */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const current = LANGUAGES.find((l) => i18n.language.startsWith(l.code)) ?? LANGUAGES[0];
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  // close when the player taps elsewhere
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => {
    if (open) items.current[focus]?.focus();
  }, [open, focus]);

  function pick(code: LanguageCode) {
    setLanguage(code);
    setOpen(false);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') setFocus((f) => (f + 1) % LANGUAGES.length);
    else if (e.key === 'ArrowUp') setFocus((f) => (f - 1 + LANGUAGES.length) % LANGUAGES.length);
    else return;
    e.preventDefault();
  }

  return (
    <div className="lang-switch" ref={root} onKeyDown={onKey}>
      <button
        type="button"
        className="lang-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('language')}: ${current.name}`}
        onClick={() => {
          setFocus(Math.max(0, LANGUAGES.indexOf(current)));
          setOpen((o) => !o);
        }}
      >
        <img src={`/flags/${current.flag}.webp`} alt="" width={22} height={16} />
        <span>{current.code.toUpperCase()}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" width="10" height="10">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <ul className="lang-list" role="listbox" aria-label={t('language')}>
          {LANGUAGES.map((l, i) => (
            <li
              key={l.code}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="option"
              tabIndex={-1}
              aria-selected={l.code === current.code}
              lang={l.code}
              onClick={() => pick(l.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(l.code);
                }
              }}
            >
              <img src={`/flags/${l.flag}.webp`} alt="" width={22} height={16} />
              <span>{l.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
