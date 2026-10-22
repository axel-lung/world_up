import { Check, Hourglass, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { displayName } from '@/components/card/card-format';
import type { TradeChip } from '@/components/trade/TradeSummary';
import { Tag } from '@/components/ui/Tag';
import { cardPath } from '@/lib/catalog/cards';
import type { TradeItem, TradeState } from '@/lib/game/trades';

const TONES = {
  pending: { variant: 'warning', Icon: Hourglass },
  accepted: { variant: 'success', Icon: Check },
  declined: { variant: 'danger', Icon: X },
  cancelled: { variant: 'subtle', Icon: null },
  expired: { variant: 'subtle', Icon: null },
} as const;

/** The offer's state as a status tag: "En attente", "Acceptée"... */
export async function TradeStateTag({ state }: { state: TradeState }) {
  const t = await getTranslations('Trades');
  const { variant, Icon } = TONES[state];
  return (
    <Tag variant={variant} icon={Icon ? <Icon aria-hidden /> : undefined}>
      {t(`states.${state}`)}
    </Tag>
  );
}

/** A side's cards as chips linking to their pages. */
export async function tradeChips(items: TradeItem[], collection: string): Promise<TradeChip[]> {
  const tRarity = await getTranslations('Rarity');
  return items.map((item) => ({
    name: displayName(item.name),
    rarity: item.rarity,
    rarityLabel: tRarity(item.rarity),
    quantity: item.quantity,
    href: cardPath(collection, item.slug),
  }));
}
