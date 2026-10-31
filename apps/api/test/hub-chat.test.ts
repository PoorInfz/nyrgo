import { describe, expect, it } from 'vitest';
import { checkChat } from '../src/modules/hub/chat.js';

const ok = (s: string) => {
  const r = checkChat(s, 140);
  return r.ok ? r.text : r.reason;
};

describe('hub chat filter', () => {
  it('lets normal talk through, tidied', () => {
    expect(ok('  hola   a todos  ')).toBe('hola a todos');
    expect(ok('Who wants to duel? 😄')).toBe('Who wants to duel? 😄');
    expect(ok('heyyyyyyyy')).toBe('heyyy');
    expect(ok('a'.repeat(300))).toHaveLength(3);
  });

  it('keeps players from taking the talk elsewhere: no links, no contact details', () => {
    for (const s of [
      'https://example.com',
      'go to www.site.net',
      'join my discord',
      'add me on insta',
      'mi web punto com',
      'nyrgo . com',
      'write me at a.b@gmail.com',
      'mail me: name arroba gmail',
      'call 612 345 678',
      'my number is 6-1-2-3-4-5-6-7-8',
      'follow @someone123',
    ]) {
      expect(['link', 'contact']).toContain(ok(s));
    }
  });

  it('masks insults as whole words only', () => {
    expect(ok('eres un gilipollas')).toBe('eres un **********');
    expect(ok('what the FUCK')).toBe('what the ****');
    expect(ok('mi computadora')).toBe('mi computadora');
    expect(ok('I like Dickens')).toBe('I like Dickens');
  });

  it('refuses empty or invisible messages', () => {
    expect(ok('   ')).toBe('empty');
    expect(ok('​​')).toBe('empty');
  });

  it('caps the length, counting characters not bytes', () => {
    expect(ok('ñ'.repeat(200))).toBe('ñññ');
    const r = checkChat('word '.repeat(60), 140);
    expect(r.ok && [...r.text].length).toBeLessThanOrEqual(140);
  });
});
