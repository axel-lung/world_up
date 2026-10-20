import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta] = await Promise.all([getTranslations('Credits'), getTranslations('Metadata')]);
  return { title: t('title'), description: tMeta('creditsDescription'), alternates: { canonical: '/credits' } };
}

const link = (href: string) =>
  function SourceLink(chunks: ReactNode) {
    return (
      <a href={href} target="_blank" rel="noopener">
        {chunks}
      </a>
    );
  };

// Where the cards come from, and under which licences (spec, "Pages obligatoires").
export default async function CreditsPage() {
  const t = await getTranslations('Credits');
  const sections = [
    { id: 'monuments', title: t('monumentsTitle'), text: t.rich('monuments', { link: link('https://www.wikidata.org/') }) },
    { id: 'texts', title: t('textsTitle'), text: t.rich('texts', { link: link('https://fr.wikipedia.org/') }) },
    { id: 'photos', title: t('photosTitle'), text: t.rich('photos', { link: link('https://commons.wikimedia.org/') }) },
    { id: 'rarity', title: t('rarityTitle'), text: t('rarity') },
    { id: 'report', title: t('reportTitle'), text: t('report') },
  ];
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.home}>
        {t('home')}
      </Link>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`${section.id}-heading`}>
          <h2 id={`${section.id}-heading`}>{section.title}</h2>
          <p>{section.text}</p>
        </section>
      ))}
      <p className={styles.note}>{t('notAffiliated')}</p>
    </main>
  );
}
