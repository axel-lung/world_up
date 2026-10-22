import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LegalPage, legalTags } from '@/components/legal/LegalPage';
import { PRIVACY_VERSION } from '@/lib/account-rules';
import { getPublisher } from '@/lib/publisher';

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta] = await Promise.all([getTranslations('Privacy'), getTranslations('Metadata')]);
  return { title: t('title'), description: tMeta('privacyDescription'), alternates: { canonical: '/privacy' } };
}

// In the order of the page; the texts are under Privacy in messages/fr.json.
const SECTIONS = [
  'controller',
  'collected',
  'purposes',
  'public',
  'recipients',
  'retention',
  'rights',
  'cookies',
  'security',
  'changes',
] as const;

// GDPR, art. 13. The retention periods are the ones src/lib/account-retention.ts
// applies; the controller's details come from the server's .env.
export default async function PrivacyPage() {
  await connection();
  const [t, format] = await Promise.all([getTranslations('Privacy'), getFormatter()]);
  const publisher = getPublisher();
  const missing = t('missing');
  const values = {
    ...legalTags(publisher.email),
    publisher: publisher.name ?? missing,
    address: publisher.address ?? missing,
    email: publisher.email ?? missing,
    host: publisher.hostName ?? missing,
  };
  const date = format.dateTime(new Date(`${PRIVACY_VERSION}T12:00:00Z`), { dateStyle: 'long', timeZone: 'Europe/Paris' });
  return (
    <LegalPage
      title={t('title')}
      meta={t('updated', { date })}
      sections={SECTIONS.map((id) => ({ id, title: t(`${id}.title`), body: t.rich(`${id}.body`, values) }))}
    />
  );
}
