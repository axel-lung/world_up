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
    auction: (id: number) => `${home}/market/${id}`,
  };
}
