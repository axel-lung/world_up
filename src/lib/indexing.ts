/**
 * Whether search engines may index the site: NOINDEX=1 in the .env of staging,
 * which is public too, keeps it out of their results (robots.txt and a
 * noindex robots meta on every page).
 */
export function indexingAllowed(): boolean {
  return process.env.NOINDEX !== '1';
}
