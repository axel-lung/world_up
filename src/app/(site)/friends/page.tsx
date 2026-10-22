import { ArrowLeftRight, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { FriendList, FriendRow } from '@/components/social/FriendRow';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { receivedOffers } from '@/lib/game/trades';
import { listFriendRequests, listFriends } from '@/lib/social/friends';
import { requireSession } from '@/lib/session';
import { acceptFriendAction, endFriendshipAction, requestFriendAction } from './actions';
import { FriendNotice } from './FriendNotice';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Friends');
  return { title: t('title') };
}

export default async function FriendsPage({ searchParams }: PageProps<'/friends'>) {
  const { user } = await requireSession('/friends');
  const [t, format, query, friends, requests] = await Promise.all([
    getTranslations('Friends'),
    getFormatter(),
    searchParams,
    listFriends(user.id),
    listFriendRequests(user.id),
  ]);
  const game = gamePath(DEFAULT_COLLECTION_SLUG);
  const collection = await getActiveCollection(DEFAULT_COLLECTION_SLUG);
  const offers = collection ? await receivedOffers(user.id, collection.id, new Date()) : 0;
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'long', timeZone: 'Europe/Paris' });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
        <div className={styles.trades}>
          <ButtonLink href={game.trades} variant={offers > 0 ? 'primary' : 'secondary'} icon={<ArrowLeftRight aria-hidden />}>
            {t('tradesLink')}
          </ButtonLink>
          {offers > 0 && <span>{t('offersWaiting', { count: offers })}</span>}
        </div>
      </header>

      <FriendNotice params={query} />

      <section className={styles.section} aria-labelledby="add-heading">
        <h2 id="add-heading">{t('addHeading')}</h2>
        <form action={requestFriendAction} className={styles.add}>
          <input type="hidden" name="back" value="/friends" />
          <TextField
            label={t('pseudo')}
            hint={t('pseudoHint')}
            name="pseudo"
            required
            maxLength={20}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button type="submit" variant="primary" icon={<UserPlus aria-hidden />}>
            {t('send')}
          </Button>
        </form>
      </section>

      {requests.received.length > 0 && (
        <section className={styles.section} aria-labelledby="received-heading">
          <h2 id="received-heading">{t('receivedHeading')}</h2>
          <FriendList>
            {requests.received.map((request) => (
              <FriendRow key={request.id} pseudo={request.pseudo} meta={t('requestedOn', { date: date(request.at) })}>
                <form action={acceptFriendAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <input type="hidden" name="pseudo" value={request.pseudo} />
                  <Button type="submit" variant="primary" aria-label={`${t('accept')} : ${request.pseudo}`}>
                    {t('accept')}
                  </Button>
                </form>
                <form action={endFriendshipAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <input type="hidden" name="pseudo" value={request.pseudo} />
                  <input type="hidden" name="done" value="declined" />
                  <Button type="submit" variant="ghost" aria-label={`${t('decline')} : ${request.pseudo}`}>
                    {t('decline')}
                  </Button>
                </form>
              </FriendRow>
            ))}
          </FriendList>
        </section>
      )}

      <section className={styles.section} aria-labelledby="friends-heading">
        <div className={styles.sectionHeader}>
          <h2 id="friends-heading">{t('friendsHeading')}</h2>
          <span className={styles.muted}>{t('friendsCount', { count: friends.length })}</span>
        </div>
        {friends.length === 0 ? (
          <p className={styles.muted}>
            {t.rich('none', { leaderboard: (chunks) => <Link href="/leaderboard">{chunks}</Link> })}
          </p>
        ) : (
          <FriendList>
            {friends.map((friend) => (
              <FriendRow
                key={friend.id}
                pseudo={friend.pseudo}
                meta={friend.since ? t('since', { date: date(friend.since) }) : undefined}
              >
                <ButtonLink href={game.friend(friend.pseudo)}>{t('seeCollection')}</ButtonLink>
                <details className={styles.confirm}>
                  <summary>{t('remove')}</summary>
                  <form action={endFriendshipAction}>
                    <p>{t('removeConfirm', { pseudo: friend.pseudo })}</p>
                    <input type="hidden" name="id" value={friend.id} />
                    <input type="hidden" name="pseudo" value={friend.pseudo} />
                    <input type="hidden" name="done" value="removed" />
                    <Button type="submit" variant="danger">
                      {t('removeSubmit')}
                    </Button>
                  </form>
                </details>
              </FriendRow>
            ))}
          </FriendList>
        )}
      </section>

      {requests.sent.length > 0 && (
        <section className={styles.section} aria-labelledby="sent-heading">
          <h2 id="sent-heading">{t('sentHeading')}</h2>
          <FriendList>
            {requests.sent.map((request) => (
              <FriendRow key={request.id} pseudo={request.pseudo} meta={t('requestedOn', { date: date(request.at) })}>
                <form action={endFriendshipAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <input type="hidden" name="pseudo" value={request.pseudo} />
                  <input type="hidden" name="done" value="cancelled" />
                  <Button type="submit" variant="ghost" aria-label={`${t('cancel')} : ${request.pseudo}`}>
                    {t('cancel')}
                  </Button>
                </form>
              </FriendRow>
            ))}
          </FriendList>
        </section>
      )}
    </main>
  );
}
