import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
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
      <p>{t('comingSoon')}</p>
      <div className={styles.actions}>
        {session ? (
          <ButtonLink href="/account" variant="primary">
            {t('account')}
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
