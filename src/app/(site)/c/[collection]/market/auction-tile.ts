import type { AuctionTileProps } from '@/components/market/AuctionTile';
import { photoLicenseLabel, toCardData } from '@/lib/catalog/card-data';
import { printedSeries } from '@/lib/catalog/cards';
import type { AuctionView } from '@/lib/game/market';
import { gamePath } from '@/lib/game/paths';

/** The auctions as the market's tiles, with the series printed on each card. */
export async function auctionTileProps(
  list: AuctionView[],
  collectionSlug: string,
  labels: { publicDomain: string; unknownLicense: string; formerPlayer: string },
): Promise<Omit<AuctionTileProps, 'collection' | 'serverNow'>[]> {
  const printed = await printedSeries(list.map((auction) => auction.card.id));
  return list
    .filter((auction) => auction.card.photoImage)
    .map((auction) => ({
      card: toCardData(
        { ...auction.card, photoImage: auction.card.photoImage! },
        printed.get(auction.card.id) ?? null,
        photoLicenseLabel(auction.card.photoLicense, labels),
      ),
      href: gamePath(collectionSlug).auction(auction.id),
      price: auction.currentPrice,
      bidCount: auction.bidCount,
      buyoutPrice: auction.buyoutPrice,
      endsAt: auction.endsAt.toISOString(),
      seller: auction.seller ?? labels.formerPlayer,
      viewer: auction.viewer,
      state: auction.state,
    }));
}
