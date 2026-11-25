import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { GoogleAppPrompt } from '@/components/account/GoogleButton';
import { EmblemIcon } from '@/components/collection/Emblem';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { StoneArch } from '@/components/ui/StoneArch';
import { DEFAULT_COLLECTION_SLUG, PLAYER_HOME } from '@/lib/collections';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { getSession } from '@/lib/session';
import { googleSignInEnabled } from '@/lib/sign-in-methods';
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
      {deleted && (
        <Notice tone="success">
          <p>{t('deleted')}</p>
        </Notice>
      )}
      {/* A church window: the rose with the logo, three lancets of rarity glass. The logo repeats the title: no text alternative. */}
      <StoneArch rose="large" className={styles.window}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a WebP already sized, like the cards */}
        <img className={styles.logo} src="/logo/world-up-144.webp" width={144} height={144} alt="" fetchPriority="high" />
        <span className={styles.lancets} aria-hidden="true">
          <span data-rarity="legendary" />
          <span data-rarity="ultra" />
          <span data-rarity="rare" />
        </span>
      </StoneArch>
      <div className={styles.text}>
        {collection && (
          <p className={styles.collection}>
            <EmblemIcon emblem={collection.emblem} aria-hidden />
            {collection.name}
          </p>
        )}
        <h1>{t('title')}</h1>
        <p className={styles.lead}>{t('intro')}</p>
      </div>
      {/* In the app, its first launch offers the phone's Google accounts */}
      {!session && googleSignInEnabled() && <GoogleAppPrompt home={PLAYER_HOME} />}
      <div className={styles.actions}>
        {session ? (
          <ButtonLink href={gamePath(DEFAULT_COLLECTION_SLUG).home} variant="primary" size="large" block>
            {t('play')}
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href="/signup" variant="primary" size="large" block>
              {t('signup')}
            </ButtonLink>
            <ButtonLink href="/login" size="large" block>
              {t('login')}
            </ButtonLink>
          </>
        )}
        <p className={styles.learnMore}>
          {t.rich('learnMore', {
            rules: (chunks) => <Link href="/rules">{chunks}</Link>,
            odds: (chunks) => <Link href="/odds">{chunks}</Link>,
          })}
        </p>
      </div>
    </main>
  );
}
