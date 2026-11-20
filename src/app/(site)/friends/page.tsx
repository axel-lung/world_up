import { ArrowLeftRight, Check, Layers, UserPlus, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { FriendList, FriendRow } from '@/components/social/FriendRow';
import { SocialTabs } from '@/components/social/SocialTabs';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { distinctCards } from '@/lib/game/leaderboard';
import { gamePath } from '@/lib/game/paths';
import { getActiveCollection } from '@/lib/game/rules';
import { listFriendRequests, listFriends } from '@/lib/social/friends';
import { requireSession } from '@/lib/session';
import phone from '../phone.module.css';
import { acceptFriendAction, endFriendshipAction, requestFriendAction } from './actions';
import { FriendNotice } from './FriendNotice';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Friends');
  return { title: t('title') };
}

/**
 * The player's friends and requests. A phone lists the requests received as
 * banners (accepted with one tap; a tap on the player opens their sheet, where
 * they are refused), then the friends with their cards, a trade and their
 * collection one tap away; adding a friend opens a sheet.
 */
export default async function FriendsPage({ searchParams }: PageProps<'/friends'>) {
  const { user } = await requireSession('/friends');
  const [t, tSocial, format, query, friends, requests, collection] = await Promise.all([
    getTranslations('Friends'),
    getTranslations('Social'),
    getFormatter(),
    searchParams,
    listFriends(user.id),
    listFriendRequests(user.id),
    getActiveCollection(DEFAULT_COLLECTION_SLUG),
  ]);
  const cards = collection ? await distinctCards(collection.id, friends.map((friend) => friend.id)) : new Map<string, number>();
  const game = gamePath(DEFAULT_COLLECTION_SLUG);
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'long', timeZone: 'Europe/Paris' });
  const initial = (pseudo: string) => pseudo.charAt(0).toLocaleUpperCase('fr');

  const hidden = (id: string, pseudo: string, done?: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="pseudo" value={pseudo} />
      {done && <input type="hidden" name="done" value={done} />}
    </>
  );

  return (
    <main className={`${styles.page} ${phone.page}`} data-tight>
      <header className={`${phone.head} phone-only`}>
        <h1>{tSocial('title')}</h1>
      </header>
      <SocialTabs current="friends" userId={user.id} />
      <header className={`${styles.header} wide-only`}>
        <h1>{t('title')}</h1>
        <p className={styles.muted}>{t('intro')}</p>
      </header>

      <FriendNotice params={query} />

      {/* A phone: the requests received, the friends, the requests sent */}
      {requests.received.length > 0 && (
        <section className={`${styles.phoneList} phone-only`} aria-labelledby="phone-received-heading">
          <h2 id="phone-received-heading" className="sr-only">
            {t('receivedHeading')}
          </h2>
          <ul className={styles.requests}>
            {requests.received.map((request) => (
              <li key={request.id} className={styles.request}>
                <Sheet
                  title={request.pseudo}
                  closeOnSubmit
                  trigger={{
                    className: styles.who,
                    content: (
                      <>
                        <span className={phone.avatar} data-inked aria-hidden="true">
                          {initial(request.pseudo)}
                        </span>
                        <span className={phone.rowText}>
                          <span className={phone.rowTitle}>{t('requestFrom', { pseudo: request.pseudo })}</span>
                          <span className={phone.rowMeta}>{t('requestedOn', { date: date(request.at) })}</span>
                        </span>
                      </>
                    ),
                  }}
                >
                  <p className={phone.muted}>{t('requestedOn', { date: date(request.at) })}</p>
                  <div className={styles.answers}>
                    <form action={endFriendshipAction}>
                      {hidden(request.id, request.pseudo, 'declined')}
                      <Button type="submit" size="large" block>
                        {t('decline')}
                      </Button>
                    </form>
                    <form action={acceptFriendAction}>
                      {hidden(request.id, request.pseudo)}
                      <Button type="submit" variant="primary" size="large" block>
                        {t('accept')}
                      </Button>
                    </form>
                  </div>
                </Sheet>
                <form action={acceptFriendAction}>
                  {hidden(request.id, request.pseudo)}
                  <button type="submit" className={styles.accept} aria-label={`${t('accept')} : ${request.pseudo}`}>
                    <Check aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${styles.phoneList} phone-only`} aria-labelledby="phone-friends-heading">
        <h2 id="phone-friends-heading" className="sr-only">
          {t('friendsHeading')}
        </h2>
        {friends.length === 0 ? (
          <p className={phone.muted}>
            {t.rich('none', { leaderboard: (chunks) => <Link href="/leaderboard">{chunks}</Link> })}
          </p>
        ) : (
          <ul className={phone.rows}>
            {friends.map((friend) => (
              <li key={friend.id} className={styles.friend}>
                <Sheet
                  title={friend.pseudo}
                  closeOnSubmit
                  trigger={{
                    className: styles.who,
                    content: (
                      <>
                        <span className={phone.avatar} aria-hidden="true">
                          {initial(friend.pseudo)}
                        </span>
                        <span className={phone.rowText}>
                          <span className={phone.rowTitle}>{friend.pseudo}</span>
                          <span className={phone.rowMeta}>{t('cards', { count: cards.get(friend.id) ?? 0 })}</span>
                        </span>
                      </>
                    ),
                  }}
                >
                  {friend.since && <p className={phone.muted}>{t('since', { date: date(friend.since) })}</p>}
                  <Link href={game.friend(friend.pseudo)} replace className={phone.block}>
                    <Layers aria-hidden />
                    {t('seeCollection')}
                  </Link>
                  <Link href={game.newTrade(friend.pseudo)} replace className={phone.block}>
                    <ArrowLeftRight aria-hidden />
                    {t('proposeTrade')}
                  </Link>
                  <form action={endFriendshipAction} className={styles.remove}>
                    {hidden(friend.id, friend.pseudo, 'removed')}
                    <p className={phone.muted}>{t('removeConfirm', { pseudo: friend.pseudo })}</p>
                    <Button type="submit" variant="danger" block>
                      {t('remove')}
                    </Button>
                  </form>
                </Sheet>
                <Link
                  href={game.newTrade(friend.pseudo)}
                  className={phone.iconAction}
                  data-tone="sage"
                  aria-label={t('proposeTradeTo', { pseudo: friend.pseudo })}
                >
                  <ArrowLeftRight aria-hidden />
                </Link>
                <Link
                  href={game.friend(friend.pseudo)}
                  className={phone.iconAction}
                  aria-label={t('seeCollectionOf', { pseudo: friend.pseudo })}
                >
                  <Layers aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {requests.sent.length > 0 && (
        <section className={`${styles.phoneList} phone-only`} aria-labelledby="phone-sent-heading">
          <h2 id="phone-sent-heading" className={phone.groupTitle}>
            {t('sentHeading')}
          </h2>
          <ul className={phone.rows}>
            {requests.sent.map((request) => (
              <li key={request.id} className={styles.friend}>
                <span className={styles.who}>
                  <span className={phone.avatar} aria-hidden="true">
                    {initial(request.pseudo)}
                  </span>
                  <span className={phone.rowText}>
                    <span className={phone.rowTitle}>{request.pseudo}</span>
                    <span className={phone.rowMeta}>{t('requestedOn', { date: date(request.at) })}</span>
                  </span>
                </span>
                <form action={endFriendshipAction}>
                  {hidden(request.id, request.pseudo, 'cancelled')}
                  <button type="submit" className={phone.iconAction} aria-label={`${t('cancel')} : ${request.pseudo}`}>
                    <X aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The form to add a friend: in its section on a wider screen, in a sheet on a phone */}
      <section className={`${styles.section} ${styles.add}`} aria-labelledby="add-heading">
        <h2 id="add-heading" className="wide-only">
          {t('addHeading')}
        </h2>
        <Sheet
          title={t('addHeading')}
          inline
          closeOnSubmit
          trigger={{
            className: phone.block,
            content: (
              <>
                <UserPlus aria-hidden />
                {t('addHeading')}
              </>
            ),
          }}
        >
          <form action={requestFriendAction} className={styles.addForm}>
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
        </Sheet>
      </section>

      {/* A wider screen */}
      {requests.received.length > 0 && (
        <section className={`${styles.section} wide-only`} aria-labelledby="received-heading">
          <h2 id="received-heading">{t('receivedHeading')}</h2>
          <FriendList>
            {requests.received.map((request) => (
              <FriendRow key={request.id} pseudo={request.pseudo} meta={t('requestedOn', { date: date(request.at) })}>
                <form action={acceptFriendAction}>
                  {hidden(request.id, request.pseudo)}
                  <Button type="submit" variant="primary" aria-label={`${t('accept')} : ${request.pseudo}`}>
                    {t('accept')}
                  </Button>
                </form>
                <form action={endFriendshipAction}>
                  {hidden(request.id, request.pseudo, 'declined')}
                  <Button type="submit" variant="ghost" aria-label={`${t('decline')} : ${request.pseudo}`}>
                    {t('decline')}
                  </Button>
                </form>
              </FriendRow>
            ))}
          </FriendList>
        </section>
      )}

      <section className={`${styles.section} wide-only`} aria-labelledby="friends-heading">
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
                    {hidden(friend.id, friend.pseudo, 'removed')}
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
        <section className={`${styles.section} wide-only`} aria-labelledby="sent-heading">
          <h2 id="sent-heading">{t('sentHeading')}</h2>
          <FriendList>
            {requests.sent.map((request) => (
              <FriendRow key={request.id} pseudo={request.pseudo} meta={t('requestedOn', { date: date(request.at) })}>
                <form action={endFriendshipAction}>
                  {hidden(request.id, request.pseudo, 'cancelled')}
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
