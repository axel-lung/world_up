import type { Rarity } from '@/lib/rarity';
import type { Achievement } from './achievements';

// The title of an achievement, from messages/fr.json (Achievements), for
// server pages (getTranslations) and client components (useTranslations).

type Translate = (key: 'packs_opened' | 'distinct_cards' | 'rarity_owned' | 'series_completed', values: Record<string, string | number>) => string;

export function achievementTitle(
  t: Translate,
  rarityLabel: (rarity: Rarity) => string,
  achievement: Pick<Achievement, 'kind' | 'threshold' | 'rarity'>,
): string {
  if (achievement.kind === 'rarity_owned') {
    return t('rarity_owned', { rarity: achievement.rarity ? rarityLabel(achievement.rarity) : '', count: achievement.threshold });
  }
  return t(achievement.kind, { count: achievement.threshold });
}
