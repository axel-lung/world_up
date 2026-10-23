// The game's addresses for a collection (the spec's "Interface" route table).
export function gamePath(collection: string) {
  const home = `/c/${collection}`;
  return {
    home,
    open: `${home}/open`,
    collection: `${home}/collection`,
    series: (slug: string) => `${home}/series/${slug}`,
    friend: (pseudo: string) => `${home}/friends/${encodeURIComponent(pseudo)}`,
    trades: `${home}/trades`,
    trade: (id: number) => `${home}/trades/${id}`,
    newTrade: (pseudo: string) => `${home}/trades/new?with=${encodeURIComponent(pseudo)}`,
    market: `${home}/market`,
    marketOfCard: (slug: string) => `${home}/market?card=${encodeURIComponent(slug)}`,
    auction: (id: number) => `${home}/market/${id}`,
    sell: (slug: string) => `${home}/market/sell?card=${encodeURIComponent(slug)}`,
    myAuctions: `${home}/market/mine`,
  };
}
