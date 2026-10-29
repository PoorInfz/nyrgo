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
