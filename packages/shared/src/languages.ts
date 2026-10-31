/**
 * The languages the game and the website speak, in the order the switch lists them. `flag` is
 * the flag shown next to the name (a country commonly linked with the language; flag art from
 * flag-icons, MIT). English is the default and the fallback for anything not translated.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', flag: 'gb' },
  { code: 'es', name: 'Español', flag: 'es' },
  { code: 'pt', name: 'Português', flag: 'br' },
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'it', name: 'Italiano', flag: 'it' },
  { code: 'nl', name: 'Nederlands', flag: 'nl' },
  { code: 'pl', name: 'Polski', flag: 'pl' },
  { code: 'tr', name: 'Türkçe', flag: 'tr' },
  { code: 'ru', name: 'Русский', flag: 'ru' },
  { code: 'uk', name: 'Українська', flag: 'ua' },
  { code: 'ar', name: 'العربية', flag: 'sa', rtl: true },
  { code: 'hi', name: 'हिन्दी', flag: 'in' },
  { code: 'id', name: 'Bahasa Indonesia', flag: 'id' },
  { code: 'ja', name: '日本語', flag: 'jp' },
  { code: 'ko', name: '한국어', flag: 'kr' },
  { code: 'zh', name: '中文', flag: 'cn' },
  { code: 'vi', name: 'Tiếng Việt', flag: 'vn' },
  { code: 'th', name: 'ไทย', flag: 'th' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const isLanguage = (l: string | null | undefined): l is LanguageCode =>
  LANGUAGES.some((x) => x.code === l);

export const isRtl = (l: string) => LANGUAGES.some((x) => x.code === l && 'rtl' in x && x.rtl);

/** The supported language closest to a browser's preference (`pt-BR` → `pt`), or null. */
export function matchLanguage(pref: string | null | undefined): LanguageCode | null {
  if (!pref) return null;
  const base = pref.toLowerCase().split(/[-_]/)[0];
  return isLanguage(base) ? base : null;
}
