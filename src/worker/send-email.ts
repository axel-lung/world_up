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

/** SMTP settings come from the environment: Mailpit locally, Brevo in production. */
export function createEmailJob(): JobDefinition {
  const user = process.env.SMTP_USER;
  const transport = nodemailer.createTransport({
    host: requireEnv('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    // Never send credentials over an unencrypted connection.
    requireTLS: Boolean(user),
    auth: user ? { user, pass: requireEnv('SMTP_PASSWORD') } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  const from = requireEnv('MAIL_FROM');

  return {
    name: queues.email.name,
    handler: async ([job]: { data: EmailJob }[]) => {
      // No address in the logs: a failure is recorded on the job by pg-boss.
      await transport.sendMail({ from, to: job.data.to, ...renderEmail(job.data) });
    },
  };
}
