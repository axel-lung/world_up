import type { CardData } from '@/components/card/Card';
import type { cards } from '@/db/schema';
import { articleUrl, cardImageUrl, commonsFileUrl } from './cards';
import { licenseLinkUrl } from './licenses';

type CardRow = Pick<
  typeof cards.$inferSelect,
  | 'name'
  | 'rarity'
  | 'department'
  | 'region'
  | 'protection'
  | 'unesco'
  | 'excerpt'
  | 'articleTitle'
  | 'photoImage'
  | 'photoCommonsFile'
  | 'photoWidth'
  | 'photoHeight'
  | 'photoAuthor'
  | 'photoLicense'
  | 'photoLicenseUrl'
>;

/** Commons says "Public domain"; the cards say it in French. */
export function photoLicenseLabel(
  license: string | null,
  labels: { publicDomain: string; unknownLicense: string },
): string {
  if (!license) return labels.unknownLicense;
  return /^public domain$/i.test(license) ? labels.publicDomain : license;
}

/** What the Card component shows of a card that has a photo. */
export function toCardData(
  card: CardRow & { photoImage: string },
  series: CardData['series'],
  licenseLabel: string,
): CardData {
  const small = cardImageUrl(card.photoImage, 400);
  const large = cardImageUrl(card.photoImage, 800);
  return {
    name: card.name,
    rarity: card.rarity,
    department: card.department,
    region: card.region,
    protection: card.protection,
    unesco: card.unesco,
    series,
    photo: {
      src: large,
      srcSet: `${small} 400w, ${large} 800w`,
      width: card.photoWidth ?? undefined,
      height: card.photoHeight ?? undefined,
      author: card.photoAuthor,
      license: licenseLabel,
      licenseUrl: licenseLinkUrl(card.photoLicenseUrl),
      fileUrl: commonsFileUrl(card.photoCommonsFile ?? ''),
    },
    excerpt: card.excerpt ?? undefined,
    articleUrl: articleUrl(card.articleTitle),
  };
}
