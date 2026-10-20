import { createTranslator } from 'next-intl';
import nodemailer from 'nodemailer';
import messages from '../../messages/fr.json';
import type { EmailJob } from '@/lib/email';
import { requireEnv } from '@/lib/env';
import { queues } from '@/lib/queues';
import type { JobDefinition } from './jobs';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function renderEmail({ template, url }: EmailJob): RenderedEmail {
  const t = createTranslator({ locale: 'fr', messages, namespace: 'Email' });
  const subject = t(`${template}.subject`);
  const intro = t(`${template}.intro`);
  const action = t(`${template}.action`);
  const note = t(`${template}.note`);
  const signature = t('signature');

  const text = [intro, '', `${action} : ${url}`, '', note, '', signature].join('\n');
  // Plain layout with inline styles: e-mail clients ignore style sheets.
  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px;background:#f3f5fe;color:#292b31;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:520px;margin:0 auto">
<p>${escapeHtml(intro)}</p>
<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border:1px solid #8a5a34;border-radius:6px;color:#6e4526;text-decoration:none;font-weight:bold">${escapeHtml(action)}</a></p>
<p style="font-size:14px;color:#595d6c">${escapeHtml(t('linkFallback'))}<br><a href="${escapeHtml(url)}" style="color:#6e4526;word-break:break-all">${escapeHtml(url)}</a></p>
<p style="font-size:14px;color:#595d6c">${escapeHtml(note)}</p>
<p>${escapeHtml(signature)}</p>
</div>
</body>
</html>`;
  return { subject, text, html };
}

// An e-mail waits 10 s at most, within the worker's 30 s stop grace period.
const TIMEOUT_MS = 10_000;
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

type Send = (to: string, email: RenderedEmail) => Promise<void>;

export interface Sender {
  name?: string;
  email: string;
}

/** Reads MAIL_FROM: `Name <address>` or a bare address. */
export function parseSender(value: string): Sender {
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/.exec(value);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: value.trim() };
}

function brevoSend(apiKey: string, sender: Sender): Send {
  return async (to, { subject, text, html }) => {
    const response = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Brevo answered ${response.status}: ${await response.text()}`);
  };
}

function smtpSend(host: string, from: string): Send {
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 1025),
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  return async (to, email) => {
    await transport.sendMail({ from, to, ...email });
  };
}

const maskAddresses = (text: string) => text.replace(/[^\s<>"':,]+@[^\s<>"':,]+/g, '<address>');

/**
 * Brevo's transactional API when BREVO_API_KEY is set (production, staging),
 * otherwise SMTP to the mail catcher at SMTP_HOST (Mailpit, locally and in CI).
 */
export function createEmailJob(): JobDefinition {
  const from = requireEnv('MAIL_FROM');
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey && !process.env.SMTP_HOST) {
    throw new Error('Missing environment variable BREVO_API_KEY (or SMTP_HOST for a local mail catcher)');
  }
  const send = apiKey ? brevoSend(apiKey, parseSender(from)) : smtpSend(process.env.SMTP_HOST!, from);

  return {
    name: queues.email.name,
    handler: async ([job]: { data: EmailJob }[]) => {
      try {
        await send(job.data.to, renderEmail(job.data));
      } catch (error) {
        // Logged so that `docker compose logs` shows why, with no address in it.
        // pg-boss keeps the same reason on the job and retries it.
        const reason = maskAddresses(error instanceof Error ? error.message : String(error));
        console.error(`E-mail ${job.data.template} not sent: ${reason}`);
        throw new Error(reason);
      }
    },
  };
}
