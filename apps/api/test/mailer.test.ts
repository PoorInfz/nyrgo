import { describe, expect, it } from 'vitest';
import { ResendMailer } from '../src/modules/auth/mailer.js';

describe('ResendMailer', () => {
  it('posts the message to Resend with the key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'm1' }), { status: 200 });
    }) as unknown as typeof fetch;
    await new ResendMailer({ apiKey: 're_key', from: 'nyrGo! <hola@nyrgo.test>' }, fake).send({
      to: 'a@b.test',
      subject: 'Hola',
      text: 'Enlace: https://x',
      link: 'https://x',
    });
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      from: 'nyrGo! <hola@nyrgo.test>',
      to: ['a@b.test'],
      subject: 'Hola',
      text: 'Enlace: https://x',
    });
  });

  it('fails with Resend’s reason, without the address', async () => {
    const fake = (async () =>
      new Response('{"message":"The nyrgo.test domain is not verified"}', {
        status: 403,
      })) as unknown as typeof fetch;
    const err = await new ResendMailer({ apiKey: 're_key', from: 'x <a@nyrgo.test>' }, fake)
      .send({ to: 'secret@b.test', subject: 's', text: 't' })
      .catch((e: Error) => e);
    expect(String(err)).toMatch(/403.*not verified/);
    expect(String(err)).not.toMatch(/secret@b\.test/);
  });
});
