import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { db } from '@/db';
import { getReserve } from '@/lib/game/packs';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection, getGameRules } from '@/lib/game/rules';
import { requireSession } from '@/lib/session';
import { PackOpener } from './PackOpener';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Open');
  return { title: t('title') };
}

// The (play) group has no site header or footer: the opening fills the screen,
// and its close button leads back to the collection's home.
export default async function OpenPage({ params }: PageProps<'/c/[collection]/open'>) {
  const collection = await getActiveCollection((await params).collection);
  if (!collection) notFound();
  const paths = gamePath(collection.slug);
  const { user } = await requireSession(paths.open);
  const now = new Date();
  const [reserve, rules] = await Promise.all([getReserve(user.id, collection.id, now), getGameRules(db, collection.id)]);

  return (
    <PackOpener
      collection={collection.slug}
      collectionName={collection.name}
      emblem={collection.emblem}
      cardsPerPack={rules.cardsPerPack}
      homeHref={paths.home}
      collectionHref={paths.collection}
      initialReserve={{
        available: reserve.packs,
        max: reserve.maxReserve,
        nextPackAt: reserve.nextPackAt?.toISOString() ?? null,
        serverNow: now.toISOString(),
        refillMinutes: reserve.refillMinutes,
      }}
    />
  );
}
