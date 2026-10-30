import type { FastifyBaseLogger } from 'fastify';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Sign-in link carried by the message, kept separate so dev drivers can surface it. */
  link?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/** Development only: prints the link to the API log instead of sending email. */
export class LogMailer implements Mailer {
  constructor(private readonly log: FastifyBaseLogger) {}

  async send(msg: MailMessage): Promise<void> {
    // The address is deliberately not logged; the link is enough to test the flow locally.
    this.log.info({ subject: msg.subject, link: msg.link }, 'dev mail (not sent)');
  }
}

/** Tests: keeps messages in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
  }

  last(): MailMessage | undefined {
    return this.sent.at(-1);
  }
}

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  constructor(
    private readonly opts: { apiKey: string; from: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    const res = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.opts.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // The body names the problem (unverified domain, bad key); it never holds the address.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Resend refused the email (${res.status}): ${detail}`);
    }
  }
}
