import { Anchor, Castle, Church, Landmark, type LucideProps, Mountain, Trees } from 'lucide-react';
import type { Emblem } from '@/lib/collection-theme';

const ICONS: Record<Emblem, typeof Landmark> = {
  landmark: Landmark,
  castle: Castle,
  church: Church,
  mountain: Mountain,
  trees: Trees,
  anchor: Anchor,
};

/** The collection's emblem (collections.theme), on its packs and card footers. */
export function EmblemIcon({ emblem, ...props }: { emblem: Emblem } & LucideProps) {
  const Icon = ICONS[emblem];
  return <Icon {...props} />;
}
