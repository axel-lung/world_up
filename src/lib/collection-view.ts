/**
 * How the player likes their collection laid out: the cards in a grid, or a
 * denser list, handier on a phone. Kept in a cookie so the server renders the
 * chosen layout at once; like the theme (theme-preference.ts), a display
 * setting the player picks themselves needs no consent. Until they pick one, a
 * phone gets the list and a wider screen the grid.
 */
export const COLLECTION_VIEW_COOKIE = 'collection-view';
export const COLLECTION_VIEWS = ['grid', 'list'] as const;
export type CollectionView = (typeof COLLECTION_VIEWS)[number];

const ONE_YEAR = 365 * 24 * 60 * 60;

/**
 * The layout in a request's cookies (the store returned by next/headers'
 * cookies()); without one, the list on a phone (isPhoneRequest) and the grid elsewhere.
 */
export function collectionView(cookies: { get(name: string): { value: string } | undefined }, phone = false): CollectionView {
  const value = cookies.get(COLLECTION_VIEW_COOKIE)?.value;
  if (value === 'list' || value === 'grid') return value;
  return phone ? 'list' : 'grid';
}

/**
 * Whether a request comes from a phone, for a default the server must pick
 * before the screen's width is known: the browser's client hint, or its user
 * agent (the app's WebView says "Mobile", a tablet doesn't).
 */
export function isPhoneRequest(headers: { get(name: string): string | null }): boolean {
  const hint = headers.get('sec-ch-ua-mobile');
  if (hint) return hint === '?1';
  return /\b(Mobile|iPhone|iPod)\b/.test(headers.get('user-agent') ?? '');
}

/** What to write to document.cookie to store a layout. */
export function collectionViewCookie(view: CollectionView, secure: boolean): string {
  return `${COLLECTION_VIEW_COOKIE}=${view}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}
