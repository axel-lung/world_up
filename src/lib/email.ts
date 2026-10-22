// Transactional e-mails, sent by the worker (src/worker/send-email.ts). Their
// texts are in messages/fr.json, under Email.<template>.
export const EMAIL_TEMPLATES = ['verifyEmail', 'resetPassword', 'existingAccount', 'inactiveAccount'] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export interface EmailJob {
  template: EmailTemplate;
  to: string;
  /** The link the e-mail's button opens. */
  url: string;
}
