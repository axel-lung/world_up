/**
 * How the player likes their collection laid out: the cards in a grid, or a
 * denser list, handier on a phone. Kept in a cookie so the server renders the
 * chosen layout at once; like the theme (theme-preference.ts), a display
 * setting the player picks themselves needs no consent.
 */
export const COLLECTION_VIEW_COOKIE = 'collection-view';
export const COLLECTION_VIEWS = ['grid', 'list'] as const;
export type CollectionView = (typeof COLLECTION_VIEWS)[number];

const ONE_YEAR = 365 * 24 * 60 * 60;

/** The layout in a request's cookies (the store returned by next/headers' cookies()); the grid by default. */
export function collectionView(cookies: { get(name: string): { value: string } | undefined }): CollectionView {
  return cookies.get(COLLECTION_VIEW_COOKIE)?.value === 'list' ? 'list' : 'grid';
}

/** What to write to document.cookie to store a layout (the grid, the default, deletes the cookie). */
export function collectionViewCookie(view: CollectionView, secure: boolean): string {
  const attributes = `Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  return view === 'grid'
    ? `${COLLECTION_VIEW_COOKIE}=; Max-Age=0; ${attributes}`
    : `${COLLECTION_VIEW_COOKIE}=list; Max-Age=${ONE_YEAR}; ${attributes}`;
}
