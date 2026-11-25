/**
 * How the player likes their collection laid out: the cards in a grid, or a
 * denser list. Kept in a cookie so the server renders the chosen layout at
 * once; a display setting the player picks themselves needs no consent. Until
 * they pick one, the grid (three vitrail cards a row on a phone).
 */
export const COLLECTION_VIEW_COOKIE = 'collection-view';
export const COLLECTION_VIEWS = ['grid', 'list'] as const;
export type CollectionView = (typeof COLLECTION_VIEWS)[number];

const ONE_YEAR = 365 * 24 * 60 * 60;

/** The layout in a request's cookies (the store returned by next/headers' cookies()); the grid without one. */
export function collectionView(cookies: { get(name: string): { value: string } | undefined }): CollectionView {
  const value = cookies.get(COLLECTION_VIEW_COOKIE)?.value;
  return value === 'list' ? 'list' : 'grid';
}

/** What to write to document.cookie to store a layout. */
export function collectionViewCookie(view: CollectionView, secure: boolean): string {
  return `${COLLECTION_VIEW_COOKIE}=${view}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}
