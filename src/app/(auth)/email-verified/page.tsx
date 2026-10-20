import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import styles from '@/components/account/AuthForm.module.css';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.verified');
  return { title: t('title') };
}

// Where the confirmation link of the signup e-mail leads, through Better Auth's
// /api/auth/verify-email: it signs the player in, or adds ?error=… when the link is stale.
export default async function EmailVerifiedPage({ searchParams }: PageProps<'/email-verified'>) {
  const { error } = await searchParams;
  const t = await getTranslations('Auth.verified');

  if (error) {
    return (
      <div className={styles.form}>
        <h1 className={styles.title}>{t('invalidTitle')}</h1>
        <Notice tone="danger">
          <p>{t('invalid')}</p>
        </Notice>
        <ButtonLink href="/login" variant="primary" block>
          {t('login')}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <h1 className={styles.title}>{t('title')}</h1>
      <Notice tone="success">
        <p>{t('done')}</p>
      </Notice>
      <ButtonLink href="/account" variant="primary" block>
        {t('continue')}
      </ButtonLink>
    </div>
  );
}
