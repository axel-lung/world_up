/**
 * The visitor's theme choice, kept in a cookie so the server renders <html>
 * with it: no flash of the other theme on load. "system" follows the device
 * setting and is the cookie's absence; "light" or "dark" sets data-theme on
 * <html>, which src/styles/theme.css and the collection themes obey. A display
 * setting the visitor picks themselves, so it needs no consent (CNIL).
 */
export const THEME_COOKIE = 'theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const ONE_YEAR = 365 * 24 * 60 * 60;

/** The preference in a request's cookies (the store returned by next/headers' cookies()). */
export function themePreference(cookies: { get(name: string): { value: string } | undefined }): ThemePreference {
  const value = cookies.get(THEME_COOKIE)?.value;
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The data-theme attribute <html> takes: none when following the device. */
export function themeAttribute(preference: ThemePreference): 'light' | 'dark' | undefined {
  return preference === 'system' ? undefined : preference;
}

/** What to write to document.cookie to store a preference ("system" deletes the cookie). */
export function themeCookie(preference: ThemePreference, secure: boolean): string {
  const attributes = `Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  return preference === 'system'
    ? `${THEME_COOKIE}=; Max-Age=0; ${attributes}`
    : `${THEME_COOKIE}=${preference}; Max-Age=${ONE_YEAR}; ${attributes}`;
}
