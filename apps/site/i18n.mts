/**
 * The website's text, one JSON file per language in locales/ (English is the reference and the
 * fallback). English is served at /, every other language at /<code>/. {{COUNT}}, {{ELEMENTS}}
 * and {{TOTAL}} in the text are filled from the game's data.
 */
import { readFileSync } from 'node:fs';
import { LANGUAGES, type LanguageCode, type Rarity } from '@nyrgo/shared';

export type Lang = LanguageCode;

/** Number formatting for each language. */
const LOCALE: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ru: 'ru-RU',
  uk: 'uk-UA',
  ar: 'ar',
  hi: 'hi-IN',
  id: 'id-ID',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  vi: 'vi-VN',
  th: 'th-TH',
};

export const LANGS = Object.fromEntries(
  LANGUAGES.map((l) => [
    l.code,
    {
      path: l.code === 'en' ? '/' : `/${l.code}/`,
      locale: LOCALE[l.code],
      label: l.code.toUpperCase(),
      name: l.name,
      flag: l.flag,
      rtl: 'rtl' in l && l.rtl === true,
    },
  ]),
) as Record<
  Lang,
  { path: string; locale: string; label: string; name: string; flag: string; rtl: boolean }
>;

type File = Record<string, string> & { _rarity?: Partial<Record<Rarity, string>> };
const load = (l: Lang): File | null => {
  try {
    return JSON.parse(readFileSync(new URL(`./locales/${l}.json`, import.meta.url), 'utf8'));
  } catch {
    return null;
  }
};

const EN = load('en')!;
export type TextKey = Exclude<keyof typeof EN, '_rarity'>;

/** Languages with a translation file; the others are not built. */
export const BUILT: Lang[] = [];
export const TEXT = {} as Record<Lang, Record<string, string>>;
export const RARITY = {} as Record<Lang, Record<Rarity, string>>;
/** Keys a language is missing (filled from English), for the build log. */
export const MISSING: Partial<Record<Lang, string[]>> = {};

for (const { code } of LANGUAGES) {
  const f = load(code);
  if (!f) continue;
  BUILT.push(code);
  const { _rarity, ...text } = f;
  const { _rarity: enRarity, ...enText } = EN;
  const missing = Object.keys(enText).filter((k) => typeof text[k] !== 'string' || !text[k]);
  if (missing.length) MISSING[code] = missing;
  TEXT[code] = { ...enText, ...text } as Record<string, string>;
  RARITY[code] = { ...enRarity, ..._rarity } as Record<Rarity, string>;
}
