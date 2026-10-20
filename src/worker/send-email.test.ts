import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_TEMPLATES, type EmailJob } from '@/lib/email';
import { createEmailJob, parseSender, renderEmail } from './send-email';

describe('renderEmail', () => {
  it.each(EMAIL_TEMPLATES)('renders %s in French with its link', (template) => {
    const url = 'https://jeu.example/api/auth/verify-email?token=abc&callbackURL=%2Femail-verified';
    const email = renderEmail({ template, to: 'joueur@example.test', url });
    expect(email.subject).not.toBe('');
    expect(email.text).toContain(url);
    expect(email.html).toContain('lang="fr"');
    // The link is HTML-escaped in the markup.
    expect(email.html).toContain('token=abc&#38;callbackURL=%2Femail-verified');
  });

  it('never prints the recipient address', () => {
    const email = renderEmail({ template: 'verifyEmail', to: 'joueur@example.test', url: 'https://jeu.example/' });
    expect(`${email.subject}${email.text}${email.html}`).not.toContain('joueur@example.test');
  });
});

describe('parseSender', () => {
  it.each([
    ['Patrimoine de France <no-reply@jeu.example>', { name: 'Patrimoine de France', email: 'no-reply@jeu.example' }],
    ['"Patrimoine de France" <no-reply@jeu.example>', { name: 'Patrimoine de France', email: 'no-reply@jeu.example' }],
    ['<no-reply@jeu.example>', { email: 'no-reply@jeu.example' }],
    [' no-reply@jeu.example ', { email: 'no-reply@jeu.example' }],
  ])('reads %s', (value, sender) => {
    expect(parseSender(value)).toEqual(sender);
  });
});

describe('createEmailJob with Brevo', () => {
  const job: EmailJob = { template: 'verifyEmail', to: 'joueur@example.test', url: 'https://jeu.example/' };

  function brevoJob(response: Response) {
    vi.stubEnv('BREVO_API_KEY', 'xkeysib-test');
    vi.stubEnv('MAIL_FROM', 'Patrimoine de France <no-reply@jeu.example>');
    const fetch = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handler } = createEmailJob();
    return { fetch, run: () => handler([{ data: job }] as Parameters<typeof handler>[0]) };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the rendered e-mail to the transactional API', async () => {
    const { fetch, run } = brevoJob(new Response('{"messageId":"<1@brevo>"}', { status: 201 }));
    await run();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'xkeysib-test' });
    const { subject, text, html } = renderEmail(job);
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'Patrimoine de France', email: 'no-reply@jeu.example' },
      to: [{ email: 'joueur@example.test' }],
      subject,
      textContent: text,
      htmlContent: html,
    });
  });

  it('fails with the reason Brevo gives, without the address', async () => {
    const body = '{"code":"invalid_parameter","message":"Recipient joueur@example.test is blocked"}';
    const { run } = brevoJob(new Response(body, { status: 400 }));
    const failure = run();
    await expect(failure).rejects.toThrow('Brevo answered 400');
    await expect(failure).rejects.toThrow('Recipient <address> is blocked');
    const logged = vi.mocked(console.error).mock.calls.join(' ');
    expect(logged).toContain('Recipient <address> is blocked');
    expect(logged).not.toContain('joueur@example.test');
  });
});

describe('createEmailJob', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('needs a Brevo key or a mail catcher', () => {
    vi.stubEnv('MAIL_FROM', 'no-reply@jeu.example');
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('SMTP_HOST', '');
    expect(() => createEmailJob()).toThrow('BREVO_API_KEY');
  });
});
