import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LegalPage, legalTags } from '@/components/legal/LegalPage';
import { TERMS_VERSION } from '@/lib/account-rules';
import { getPublisher } from '@/lib/publisher';

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta] = await Promise.all([getTranslations('Terms'), getTranslations('Metadata')]);
  return { title: t('title'), description: tMeta('termsDescription'), alternates: { canonical: '/terms' } };
}

// In the order of the page; the texts are under Terms in messages/fr.json.
const SECTIONS = [
  'object',
  'access',
  'game',
  'items',
  'forbidden',
  'sanctions',
  'end',
  'content',
  'availability',
  'data',
  'changes',
  'law',
] as const;

// The terms a player accepts at signup, and again on /accept-terms when
// TERMS_VERSION changes. The publisher's details come from the server's .env.
export default async function TermsPage() {
  await connection();
  const [t, format] = await Promise.all([getTranslations('Terms'), getFormatter()]);
  const publisher = getPublisher();
  const values = {
    ...legalTags(publisher.email),
    publisher: publisher.name ?? t('missing'),
    email: publisher.email ?? t('missing'),
  };
  const date = format.dateTime(new Date(`${TERMS_VERSION}T12:00:00Z`), { dateStyle: 'long', timeZone: 'Europe/Paris' });
  return (
    <LegalPage
      title={t('title')}
      meta={t('version', { date })}
      sections={SECTIONS.map((id) => ({ id, title: t(`${id}.title`), body: t.rich(`${id}.body`, values) }))}
    />
  );
}
