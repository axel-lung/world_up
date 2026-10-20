import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getReserve } from '@/lib/game/packs';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import styles from '../game.module.css';
import { PackOpener } from './PackOpener';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Open');
  return { title: t('title') };
}

export default async function OpenPage({ params }: PageProps<'/c/[collection]/open'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.open);
  const now = new Date();
  const [t, reserve] = await Promise.all([getTranslations('Open'), getReserve(user.id, collection.id, now)]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <Link href={paths.home}>{collection.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t.rich('intro', { odds: (chunks) => <Link href="/odds">{chunks}</Link> })}</p>
      </header>
      <PackOpener
        collection={collection.slug}
        collectionName={collection.name}
        collectionHref={paths.collection}
        initialReserve={{
          available: reserve.packs,
          max: reserve.maxReserve,
          nextPackAt: reserve.nextPackAt?.toISOString() ?? null,
          serverNow: now.toISOString(),
          refillMinutes: reserve.refillMinutes,
        }}
      />
    </main>
  );
}
