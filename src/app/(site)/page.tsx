import { Sparkle } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmblemIcon } from '@/components/collection/Emblem';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Tag } from '@/components/ui/Tag';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { getSession } from '@/lib/session';
import styles from './page.module.css';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const t = await getTranslations('HomePage');
  const [session, collection, { deleted }] = await Promise.all([
    getSession(),
    getActiveCollection(DEFAULT_COLLECTION_SLUG),
    searchParams,
  ]);
  return (
    <main className={styles.page}>
      {/* Decoration from the design system: a terracotta and a sage disc, a sparkle */}
      <span className={styles.discAccent} aria-hidden="true" />
      <span className={styles.discSage} aria-hidden="true" />
      <Sparkle className={styles.sparkle} aria-hidden />

      {deleted && (
        <Notice tone="success">
          <p>{t('deleted')}</p>
        </Notice>
      )}
      {collection && (
        <Tag variant="accent" icon={<EmblemIcon emblem={collection.emblem} aria-hidden />} className={styles.collection}>
          {collection.name}
        </Tag>
      )}
      <h1>{t('title')}</h1>
      <p className={styles.lead}>{t('intro')}</p>
      <p>{t.rich('learnMore', { rules: (chunks) => <Link href="/rules">{chunks}</Link>, odds: (chunks) => <Link href="/odds">{chunks}</Link> })}</p>
      <div className={styles.actions}>
        {session ? (
          <ButtonLink href={gamePath(DEFAULT_COLLECTION_SLUG).home} variant="primary" size="large">
            {t('play')}
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href="/signup" variant="primary" size="large">
              {t('signup')}
            </ButtonLink>
            <ButtonLink href="/login">{t('login')}</ButtonLink>
          </>
        )}
      </div>
    </main>
  );
}
