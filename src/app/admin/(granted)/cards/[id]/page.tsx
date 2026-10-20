import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/card/Card';
import { displayName } from '@/components/card/card-format';
import { requireAdmin } from '@/lib/admin';
import { getAdminCard, listAudit } from '@/lib/catalog/admin';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { articleUrl, cardPath, commonsFileUrl } from '@/lib/catalog/cards';
import { AuditTable } from '../../AuditTable';
import { PhotoForm, RarityForm, VisibilityForm } from './CardForms';
import styles from '../../../admin.module.css';

async function load(id: string) {
  const cardId = Number(id);
  return Number.isSafeInteger(cardId) && cardId > 0 ? getAdminCard(cardId) : null;
}

export async function generateMetadata({ params }: PageProps<'/admin/cards/[id]'>): Promise<Metadata> {
  await requireAdmin();
  const found = await load((await params).id);
  return found ? { title: displayName(found.card.name) } : {};
}

export default async function AdminCardPage({ params }: PageProps<'/admin/cards/[id]'>) {
  await requireAdmin();
  const found = await load((await params).id);
  if (!found) notFound();
  const { card, collectionSlug, collectionName } = found;
  const [t, tCard, tRarity, history] = await Promise.all([
    getTranslations('Admin.card'),
    getTranslations('Card'),
    getTranslations('Rarity'),
    listAudit({ targetType: 'card', targetId: String(card.id), limit: 50 }),
  ]);
  const name = displayName(card.name);
  const license = photoLicenseLabel(card.photoLicense, {
    publicDomain: tCard('publicDomain'),
    unknownLicense: tCard('unknownLicense'),
  });
  const flags = [
    card.memorial && t('flag.memorial'),
    card.commercial && t('flag.commercial'),
    card.twentiethCentury && t('flag.twentieth_century'),
    card.photoProblem && t('photoProblem', { problem: t(`photoProblems.${card.photoProblem}`) }),
  ].filter(Boolean);

  return (
    <main className={styles.stack}>
      <p>
        <Link href="/admin/cards">{t('back')}</Link>
      </p>
      <header className={styles.header}>
        <h1>{name}</h1>
        {!card.hiddenReason && <Link href={cardPath(collectionSlug, card.slug)}>{t('publicPage')}</Link>}
      </header>

      <div className={styles.columns}>
        <div>
          {card.photoImage ? (
            <Card
              card={toCardData({ ...card, photoImage: card.photoImage }, null, license)}
              size="large"
              flippable
              sizes="320px"
            />
          ) : (
            <p className={styles.muted}>{t('noPhoto')}</p>
          )}
        </div>

        <div className={styles.stack}>
          <section className={styles.section} aria-labelledby="facts-heading">
            <h2 id="facts-heading">{t('facts')}</h2>
            <dl className={styles.facts}>
              <div>
                <dt>{t('collection')}</dt>
                <dd>{collectionName}</dd>
              </div>
              <div>
                <dt>{t('wikidata')}</dt>
                <dd>
                  <a href={`https://www.wikidata.org/wiki/${card.wikidataId}`} target="_blank" rel="noopener">
                    {card.wikidataId}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t('rank')}</dt>
                <dd>{card.rank}</dd>
              </div>
              <div>
                <dt>{t('family')}</dt>
                <dd>{card.family ?? t('none')}</dd>
              </div>
              <div>
                <dt>{t('article')}</dt>
                <dd>
                  <a href={articleUrl(card.articleTitle)} target="_blank" rel="noopener">
                    {card.articleTitle}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t('commonsFile')}</dt>
                <dd>
                  {card.photoCommonsFile ? (
                    <a href={commonsFileUrl(card.photoCommonsFile)} target="_blank" rel="noopener">
                      {card.photoCommonsFile}
                    </a>
                  ) : (
                    t('none')
                  )}
                </dd>
              </div>
            </dl>
            {card.photoLocked && <p className={styles.muted}>{t('photoLocked')}</p>}
          </section>

          <section className={styles.section} aria-labelledby="flags-heading">
            <h2 id="flags-heading">{t('flags')}</h2>
            {flags.length > 0 ? (
              <ul className={styles.list}>
                {flags.map((flag) => (
                  <li key={String(flag)}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t('noFlags')}</p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="visibility-heading">
            <h2 id="visibility-heading">{t('visibilityTitle')}</h2>
            <p>
              {card.hiddenReason
                ? t('hiddenNow', { reason: t(`hiddenReasons.${card.hiddenReason}`) })
                : t('visibleNow')}
            </p>
            <VisibilityForm cardId={card.id} hiddenReason={card.hiddenReason} />
          </section>

          <section className={styles.section} aria-labelledby="rarity-heading">
            <h2 id="rarity-heading">
              {t('rarityTitle')} : {tRarity(card.rarity)}
            </h2>
            <p className={styles.muted}>{t('rarityIntro')}</p>
            <RarityForm cardId={card.id} rarity={card.rarity} />
          </section>

          <section className={styles.section} aria-labelledby="photo-heading">
            <h2 id="photo-heading">{t('photoTitle')}</h2>
            <p className={styles.muted}>{t('photoIntro')}</p>
            <PhotoForm cardId={card.id} />
          </section>

          <section className={styles.section} aria-labelledby="history-heading">
            <h2 id="history-heading">{t('history')}</h2>
            <AuditTable rows={history} showTarget={false} />
          </section>
        </div>
      </div>
    </main>
  );
}
