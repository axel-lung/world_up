import { Gem, Layers, Map as MapIcon, Package, Sparkles, Stamp, Sun, TreePalm, Trophy } from 'lucide-react';
import type { Badge } from '@/lib/game/badges';
import styles from './Badge.module.css';

const ICONS = {
  packs_opened: Package,
  distinct_cards: Layers,
  rarity_owned: Gem,
  series_completed: Trophy,
  monuments_visited: Stamp,
  departments_visited: MapIcon,
  visits_in_a_day: Sun,
  rarities_visited: Sparkles,
  overseas_visited: TreePalm,
} as const;

const COMPACT = new Intl.NumberFormat('fr', { notation: 'compact' });

/**
 * An achievement's badge, an inked sticker in its tier's rarity color: its
 * kind's icon, and on the large one its threshold. Small beside a pseudo,
 * large in a showcase; locked, greyed, for one the player hasn't reached.
 * `label` is the achievement's title, read out and shown on hover; empty
 * when a text beside it already names it.
 */
export function BadgeSticker({
  badge,
  label,
  size = 'small',
  locked = false,
}: {
  badge: Pick<Badge, 'kind' | 'threshold' | 'tier'>;
  label: string;
  size?: 'small' | 'large';
  locked?: boolean;
}) {
  const Icon = ICONS[badge.kind];
  return (
    <span
      className={styles.badge}
      data-size={size}
      data-rarity={badge.tier}
      data-locked={locked || undefined}
      // Without a label, beside a text that names it: decorative
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      title={label || undefined}
    >
      <Icon aria-hidden />
      {size === 'large' && badge.kind !== 'rarity_owned' && (
        <span className={styles.count} aria-hidden="true">
          {COMPACT.format(badge.threshold)}
        </span>
      )}
    </span>
  );
}
