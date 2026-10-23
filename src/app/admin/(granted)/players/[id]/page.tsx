import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { Tag } from '@/components/ui/Tag';
import { requireAdmin } from '@/lib/admin';
import { listAudit } from '@/lib/catalog/admin';
import { getAdminPlayer } from '@/lib/players/admin';
import { AuditTable } from '../../AuditTable';
import { BanForm } from './PlayerForms';
import styles from '../../../admin.module.css';

const load = (id: string) => (z.uuid().safeParse(id).success ? getAdminPlayer(id, new Date()) : null);

export async function generateMetadata({ params }: PageProps<'/admin/players/[id]'>): Promise<Metadata> {
  await requireAdmin();
  const found = await load((await params).id);
  return found ? { title: found.player.pseudo } : {};
}

export default async function AdminPlayerPage({ params }: PageProps<'/admin/players/[id]'>) {
  await requireAdmin();
  const found = await load((await params).id);
  if (!found) notFound();
  const { player, linked, collections, partners, open } = found;
  const [t, tPlayers, format, history] = await Promise.all([
    getTranslations('Admin.player'),
    getTranslations('Admin.players'),
    getFormatter(),
    listAudit({ targetType: 'user', targetId: player.id, limit: 50 }),
  ]);
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const deals = ({ count, coins }: { count: number; coins: number }) => (count > 0 ? t('deals', { count, coins }) : t('none'));

  return (
    <main className={styles.stack}>
      <p>
        <Link href="/admin/players">{t('back')}</Link>
      </p>
      <header className={styles.header}>
        <h1>{player.pseudo}</h1>
        {player.bannedAt ? (
          <Tag variant="danger">{tPlayers('states.banned')}</Tag>
        ) : player.isAdmin ? (
          <Tag variant="accent">{t('adminAccount')}</Tag>
        ) : null}
      </header>

      <section className={styles.section} aria-labelledby="account-heading">
        <h2 id="account-heading">{t('account')}</h2>
        <dl className={styles.facts}>
          <div>
            <dt>{t('email')}</dt>
            <dd>{player.email}</dd>
          </div>
          {player.emailNormalized !== player.email && (
            <div>
              <dt>{t('mailbox')}</dt>
              <dd>{player.emailNormalized}</dd>
            </div>
          )}
          <div>
            <dt>{t('emailVerified')}</dt>
            <dd>{player.emailVerified ? t('yes') : t('no')}</dd>
          </div>
          <div>
            <dt>{t('birthDate')}</dt>
            <dd>{format.dateTime(new Date(`${player.birthDate}T12:00:00Z`), { dateStyle: 'long', timeZone: 'Europe/Paris' })}</dd>
          </div>
          <div>
            <dt>{t('signedUp')}</dt>
            <dd>{date(player.createdAt)}</dd>
          </div>
          <div>
            <dt>{t('lastActive')}</dt>
            <dd>{date(player.lastActiveAt)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="game-heading">
        <h2 id="game-heading">{t('game')}</h2>
        {collections.length === 0 ? (
          <p className={styles.muted}>{t('noGame')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('collection')}</th>
                  <th scope="col">{t('distinct')}</th>
                  <th scope="col">{t('copies')}</th>
                  <th scope="col">{t('packsOpened')}</th>
                  <th scope="col">{t('coins')}</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((collection) => (
                  <tr key={collection.id}>
                    <td>{collection.name}</td>
                    <td>{format.number(collection.distinct)}</td>
                    <td>{format.number(collection.copies)}</td>
                    <td>{format.number(collection.packsOpened)}</td>
                    <td>{format.number(collection.coins)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="linked-heading">
        <h2 id="linked-heading">{t('linkedTitle')}</h2>
        {linked.length === 0 ? (
          <p className={styles.muted}>{t('noLinked')}</p>
        ) : (
          <>
            <p className={styles.muted}>{t('linkedIntro', { mailbox: player.emailNormalized })}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{tPlayers('pseudo')}</th>
                    <th scope="col">{tPlayers('email')}</th>
                    <th scope="col">{tPlayers('signedUp')}</th>
                    <th scope="col">{tPlayers('state')}</th>
                  </tr>
                </thead>
                <tbody>
                  {linked.map((other) => (
                    <tr key={other.id}>
                      <td>
                        <Link href={`/admin/players/${other.id}`}>{other.pseudo}</Link>
                      </td>
                      <td>{other.email}</td>
                      <td>{date(other.createdAt)}</td>
                      <td>{other.bannedAt ? <Tag variant="danger">{tPlayers('states.banned')}</Tag> : tPlayers('states.active')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="partners-heading">
        <div className={styles.header}>
          <h2 id="partners-heading">{t('partnersTitle')}</h2>
          <Link href={`/admin/market?pseudo=${encodeURIComponent(player.pseudo)}`}>{t('marketLink')}</Link>
        </div>
        {partners.length === 0 ? (
          <p className={styles.muted}>{t('noPartners')}</p>
        ) : (
          <>
            <p className={styles.muted}>{t('partnersIntro')}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('partner')}</th>
                    <th scope="col">{t('trades')}</th>
                    <th scope="col">{t('sales')}</th>
                    <th scope="col">{t('purchases')}</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr key={partner.id}>
                      <td>
                        <Link href={`/admin/players/${partner.id}`}>{partner.pseudo}</Link>
                      </td>
                      <td>{partner.trades > 0 ? format.number(partner.trades) : t('none')}</td>
                      <td>{deals(partner.sold)}</td>
                      <td>{deals(partner.bought)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="ban-heading">
        <h2 id="ban-heading">{t('banTitle')}</h2>
        {player.isAdmin ? (
          <p className={styles.muted}>{t('cannotBan')}</p>
        ) : (
          <>
            <p>{player.bannedAt ? t('bannedNow', { date: date(player.bannedAt) }) : t('activeNow')}</p>
            {!player.bannedAt && (
              <>
                <p className={styles.muted}>{t('banIntro')}</p>
                <p className={styles.muted}>{t('banCancels', open)}</p>
              </>
            )}
            <BanForm userId={player.id} banned={Boolean(player.bannedAt)} />
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading">{t('history')}</h2>
        <AuditTable rows={history} showTarget={false} />
      </section>
    </main>
  );
}
