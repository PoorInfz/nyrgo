import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { LANGUAGES, isLanguage, isRtl, type LanguageCode } from '@nyrgo/shared';
import en from './locales/en.json';
import es from './locales/es.json';

/**
 * The game's text. English and Spanish ship with the app; every other language is its own small
 * file, loaded the first time it is chosen. Anything missing falls back to English.
 */
export const resources = {
  en: { translation: en },
  es: { translation: es },
};

const more = import.meta.glob<{ default: Record<string, unknown> }>([
  './locales/*.json',
  '!./locales/en.json',
  '!./locales/es.json',
]);

/** Loads a language's text if it is not in the app yet. */
async function ensure(code: LanguageCode) {
  if (i18n.hasResourceBundle(code, 'translation')) return;
  const load = more[`./locales/${code}.json`];
  if (!load) return;
  const mod = await load();
  i18n.addResourceBundle(code, 'translation', mod.default, true, true);
}

export { LANGUAGES };
export type { LanguageCode };

const KEY = 'nyrgo-lang';
const known = isLanguage;

/**
 * English unless the player chose otherwise: a `?lang=` link (the website passes its language)
 * or the choice saved by the language switch.
 */
function initialLanguage(): LanguageCode {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    const fromLink = params.get('lang');
    if (fromLink !== null) {
      // tidy the address bar: the choice is remembered, the parameter is not needed any more
      params.delete('lang');
      const rest = params.toString();
      globalThis.history?.replaceState(
        null,
        '',
        `${globalThis.location.pathname}${rest ? `?${rest}` : ''}${globalThis.location.hash}`,
      );
    }
    if (known(fromLink)) {
      localStorage.setItem(KEY, fromLink);
      return fromLink;
    }
    const saved = localStorage.getItem(KEY);
    if (known(saved)) return saved;
  } catch {
    // storage blocked (private mode): English, and the switch still works for this visit
  }
  return LANGUAGES[0].code;
}

/** Switches the game's language and remembers it on this device. */
export function setLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // not remembered, but the change still applies now
  }
  void ensure(code).then(() => i18n.changeLanguage(code));
}

i18n.on('languageChanged', (l) => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = l;
  document.documentElement.dir = isRtl(l) ? 'rtl' : 'ltr';
});

const first = initialLanguage();
void i18n.use(initReactI18next).init({
  resources,
  // a language that still has to load starts in English and switches when it arrives
  lng: first in resources ? first : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
if (!(first in resources)) setLanguage(first);

export default i18n;
