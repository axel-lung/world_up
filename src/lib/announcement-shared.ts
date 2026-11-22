// What the announcement banner's server and browser sides share
// (src/lib/announcements.ts holds the database side).

export const ANNOUNCEMENT_MAX_LENGTH = 240;

/**
 * The announcement a visitor closed: its ID, so the banner stays away on this
 * device until the next one. A display preference, like the theme.
 */
export const ANNOUNCEMENT_COOKIE = 'announcement';

export function announcementCookie(id: number, secure: boolean): string {
  return `${ANNOUNCEMENT_COOKIE}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** A page of the site ("/rules", not "//elsewhere") or an https address: never a script. */
export function isSafeLink(url: string): boolean {
  if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\');
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
