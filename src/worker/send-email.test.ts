import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES } from '@/lib/email';
import { renderEmail } from './send-email';

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
