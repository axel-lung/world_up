import { getTranslations } from 'next-intl/server';
import { Notice } from '@/components/ui/Notice';
import type { parseResaleParams } from './filters';

/** What the last resale did, read from the address resellAction returned to. */
export async function ResaleNotice({ outcome }: { outcome: ReturnType<typeof parseResaleParams> }) {
  const [t, tGame] = await Promise.all([getTranslations('Collection'), getTranslations('Game')]);
  if (outcome.error) {
    return (
      <Notice tone="info">
        <p>{tGame(`errors.${outcome.error}`)}</p>
      </Notice>
    );
  }
  if (outcome.sold === null) return null;
  return (
    <Notice tone="success">
      <p>{t('sold', { copies: outcome.sold, coins: outcome.coins })}</p>
    </Notice>
  );
}
