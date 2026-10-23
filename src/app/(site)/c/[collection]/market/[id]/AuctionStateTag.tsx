import { Check, Hourglass, Timer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Tag } from '@/components/ui/Tag';
import type { AuctionState } from '@/lib/game/auctions';

const TONES = {
  active: { variant: 'warning', Icon: Timer },
  ended: { variant: 'warning', Icon: Hourglass },
  sold: { variant: 'success', Icon: Check },
  unsold: { variant: 'subtle', Icon: null },
  cancelled: { variant: 'subtle', Icon: null },
} as const;

/** The auction's state as a status tag: "En cours", "Vendue"... */
export async function AuctionStateTag({ state }: { state: AuctionState }) {
  const t = await getTranslations('Market');
  const { variant, Icon } = TONES[state];
  return (
    <Tag variant={variant} icon={Icon ? <Icon aria-hidden /> : undefined}>
      {t(`states.${state}`)}
    </Tag>
  );
}
