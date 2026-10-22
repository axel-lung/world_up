import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LegalPage, legalTags } from '@/components/legal/LegalPage';
import styles from '@/components/legal/LegalPage.module.css';
import { getPublisher } from '@/lib/publisher';

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta] = await Promise.all([getTranslations('LegalNotice'), getTranslations('Metadata')]);
  return { title: t('title'), description: tMeta('legalNoticeDescription'), alternates: { canonical: '/legal-notice' } };
}

// LCEN, art. 6: who publishes the site and who hosts it. The details come from
// the server's .env (src/lib/publisher.ts), hence the rendering at request time.
export default async function LegalNoticePage() {
  await connection();
  const t = await getTranslations('LegalNotice');
  const publisher = getPublisher();
  const tags = legalTags(publisher.email);
  const value = (text: string | null) => text ?? <span className={styles.missing}>{t('missing')}</span>;
  const details = (rows: [string, ReactNode][]) => (
    <dl className={styles.details}>
      {rows.map(([label, text]) => [<dt key={`${label}-dt`}>{label}</dt>, <dd key={`${label}-dd`}>{text}</dd>])}
    </dl>
  );

  return (
    <LegalPage
      title={t('title')}
      meta={t('intro')}
      sections={[
        {
          id: 'publisher',
          title: t('publisherTitle'),
          body: details([
            [t('publisher'), value(publisher.name)],
            [t('address'), value(publisher.address)],
            [t('registration'), value(publisher.registration)],
            ...(publisher.vat ? [[t('vat'), publisher.vat] as [string, string]] : []),
            [t('phone'), value(publisher.phone)],
            [t('email'), publisher.email ? <a href={`mailto:${publisher.email}`}>{publisher.email}</a> : value(null)],
            [t('director'), value(publisher.director)],
          ]),
        },
        {
          id: 'host',
          title: t('hostTitle'),
          body: details([
            [t('host'), value(publisher.hostName)],
            [t('address'), value(publisher.hostAddress)],
            [t('phone'), value(publisher.hostPhone)],
          ]),
        },
        { id: 'content', title: t('contentTitle'), body: t.rich('content', tags) },
        { id: 'report', title: t('reportTitle'), body: t.rich('report', { ...tags, email: publisher.email ?? t('missing') }) },
      ]}
    />
  );
}
