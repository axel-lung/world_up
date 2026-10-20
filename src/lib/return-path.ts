/**
 * A path on this site to go to after signing in, from the ?next= parameter.
 * Anything else (another site, `//host`, `/\host`) falls back to `fallback`.
 */
export function safeReturnPath(value: string | string[] | undefined, fallback: string): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : fallback;
}
