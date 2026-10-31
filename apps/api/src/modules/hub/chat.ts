/**
 * What may be said in the town's chat. Players of any age chat, each within their own age group;
 * on top of that, every message is checked here before anyone sees it:
 *
 *  - no links and no contact details (emails, phone numbers, social handles), so nobody is drawn
 *    off the game to talk in private;
 *  - common insults are masked;
 *  - length is capped and runs of repeated characters squashed.
 *
 * The filter is a first line only: players can block and report, and admins can hide messages
 * and mute players.
 */

export type ChatCheck =
  { ok: true; text: string } | { ok: false; reason: 'empty' | 'link' | 'contact' };

const LINK =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\s?(\.|dot|punto)\s?(com|net|org|io|me|gg|xyz|es|app|link|ly|tv|co|ru|info|biz|site|online|fun)\b|discord|telegram|t\.me|whatsapp|wa\.me|snapchat|insta(gram)?|tiktok|kik\b)/i;
const EMAIL = /[a-z0-9._%+-]+\s?(@|\(at\)|\[at\]|arroba)\s?[a-z0-9.-]+/i;
/** Seven or more digits, allowing spaces, dots and dashes between them. */
const PHONE = /(\d[\s.\-()]*){7,}/;
const HANDLE = /(^|\s)@[a-z0-9_.]{3,}/i;

const INSULTS = [
  // English
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'dick',
  'cunt',
  'whore',
  'slut',
  'retard',
  'faggot',
  'nigger',
  // Spanish
  'puta',
  'puto',
  'mierda',
  'gilipollas',
  'cabron',
  'cabrón',
  'coño',
  'joder',
  'maricon',
  'maricón',
  'zorra',
  'subnormal',
  'imbecil',
  'imbécil',
  'pendejo',
];
// whole words only, so "computadora" or "Dickens" are left alone
const INSULT = new RegExp(`(?<![\\p{L}])(${INSULTS.join('|')})(?![\\p{L}])`, 'giu');

export function checkChat(raw: string, maxLength: number): ChatCheck {
  let text = raw
    .normalize('NFC')
    // control characters and zero-width tricks (matching them is the point)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (LINK.test(text)) return { ok: false, reason: 'link' };
  if (EMAIL.test(text) || PHONE.test(text) || HANDLE.test(text))
    return { ok: false, reason: 'contact' };
  // "heyyyyyyyy" → "heyyy"
  text = text.replace(/(.)\1{3,}/gu, '$1$1$1');
  text = text.replace(INSULT, (m) => '*'.repeat(m.length));
  return { ok: true, text: [...text].slice(0, maxLength).join('') };
}
