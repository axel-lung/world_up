// The game's addresses for a collection (the spec's "Interface" route table).
export function gamePath(collection: string) {
  const home = `/c/${collection}`;
  return {
    home,
    open: `${home}/open`,
    packs: `${home}/packs`,
    history: `${home}/packs/history`,
    collection: `${home}/collection`,
    wishlist: `${home}/wishlist`,
    map: `${home}/map`,
    mapOfCard: (slug: string) => `${home}/map?card=${encodeURIComponent(slug)}`,
    mapMonuments: (version: string) => `${home}/map/monuments?v=${version}`,
    series: (slug: string) => `${home}/series/${slug}`,
    friend: (pseudo: string) => `${home}/friends/${encodeURIComponent(pseudo)}`,
    trades: `${home}/trades`,
    trade: (id: number) => `${home}/trades/${id}`,
    newTrade: (pseudo: string) => `${home}/trades/new?with=${encodeURIComponent(pseudo)}`,
    market: `${home}/market`,
    marketOfCard: (slug: string) => `${home}/market?card=${encodeURIComponent(slug)}`,
    marketWished: `${home}/market?wished=1`,
    auction: (id: number) => `${home}/market/${id}`,
    sell: (slug: string) => `${home}/market/sell?card=${encodeURIComponent(slug)}`,
    myAuctions: `${home}/market/mine`,
  };
}
