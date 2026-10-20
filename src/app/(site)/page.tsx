import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { gamePath } from '@/lib/game/paths';
import { getSession } from '@/lib/session';
import styles from './page.module.css';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const t = await getTranslations('HomePage');
  const [session, { deleted }] = await Promise.all([getSession(), searchParams]);
  return (
    <main className={styles.page}>
      {deleted && (
        <Notice tone="success">
          <p>{t('deleted')}</p>
        </Notice>
      )}
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <p>{t.rich('learnMore', { rules: (chunks) => <Link href="/rules">{chunks}</Link>, odds: (chunks) => <Link href="/odds">{chunks}</Link> })}</p>
      <div className={styles.actions}>
        {session ? (
          <ButtonLink href={gamePath(DEFAULT_COLLECTION_SLUG).home} variant="primary">
            {t('play')}
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href="/signup" variant="primary">
              {t('signup')}
            </ButtonLink>
            <ButtonLink href="/login">{t('login')}</ButtonLink>
          </>
        )}
      </div>
    </main>
  );
}
