// The game's addresses for a collection (the spec's "Interface" route table).
export function gamePath(collection: string) {
  const home = `/c/${collection}`;
  return {
    home,
    open: `${home}/open`,
    collection: `${home}/collection`,
    series: (slug: string) => `${home}/series/${slug}`,
  };
}
