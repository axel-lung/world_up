/**
 * The look of one collection, stored in `collections.theme`: the accent family
 * for each theme, the --skin-* variables (the pack and emblem color) and the
 * emblem printed on its packs and card footers. Everything else (grounds, text,
 * rarity colors, the cream card itself) belongs to the shared base in
 * src/styles/theme.css, so adding a collection needs no new interface code.
 */
export interface CollectionTheme {
  dark: Record<string, string>;
  light: Record<string, string>;
  skin: Record<string, string>;
  emblem: Emblem;
}

// Icons a collection can take as its emblem (src/components/collection/Emblem.tsx).
export const EMBLEMS = ['landmark', 'castle', 'church', 'mountain', 'trees', 'anchor'] as const;
export type Emblem = (typeof EMBLEMS)[number];
export const DEFAULT_EMBLEM: Emblem = 'landmark';

const ACCENT_VARIABLE = /^--color-(accent|on-accent)(-[a-z0-9]+)*$/;
const SKIN_VARIABLE = /^--skin(-[a-z0-9]+)+$/;
// Values are written into a <style> element: refuse anything that could end the
// declaration, the rule or the element, open a comment, or load a resource.
const FORBIDDEN_IN_VALUE = /[;{}<>\\"'`]|\/\*|\*\/|url\(|@import|expression\(/i;
const MAX_VALUE_LENGTH = 200;

function parseVariables(input: unknown, name: RegExp, group: string): Record<string, string> {
  if (input === undefined) return {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`Collection theme: "${group}" must be an object`);
  }
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!name.test(key)) throw new Error(`Collection theme: "${key}" is not allowed in "${group}"`);
    if (
      typeof value !== 'string' ||
      value.trim() === '' ||
      value.length > MAX_VALUE_LENGTH ||
      FORBIDDEN_IN_VALUE.test(value)
    ) {
      throw new Error(`Collection theme: invalid value for "${key}"`);
    }
    variables[key] = value.trim();
  }
  return variables;
}

function isEmblem(value: unknown): value is Emblem {
  return (EMBLEMS as readonly unknown[]).includes(value);
}

/** Validates a `collections.theme` value; throws on anything unexpected. */
export function parseCollectionTheme(input: unknown): CollectionTheme {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Collection theme must be an object');
  }
  const { dark, light, skin, emblem, ...rest } = input as Record<string, unknown>;
  const unknownKeys = Object.keys(rest);
  if (unknownKeys.length > 0) throw new Error(`Collection theme: unknown key "${unknownKeys[0]}"`);
  if (emblem !== undefined && !isEmblem(emblem)) throw new Error('Collection theme: unknown emblem');
  return {
    dark: parseVariables(dark, ACCENT_VARIABLE, 'dark'),
    light: parseVariables(light, ACCENT_VARIABLE, 'light'),
    skin: parseVariables(skin, SKIN_VARIABLE, 'skin'),
    emblem: emblem ?? DEFAULT_EMBLEM,
  };
}

/** The emblem of a stored theme, or the default one when the theme has none or is invalid. */
export function themeEmblem(input: unknown): Emblem {
  const emblem = typeof input === 'object' && input !== null ? (input as Record<string, unknown>).emblem : undefined;
  return isEmblem(emblem) ? emblem : DEFAULT_EMBLEM;
}

function rule(selector: string, variables: Record<string, string>): string {
  const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value}`);
  return declarations.length > 0 ? `${selector}{${declarations.join(';')}}` : '';
}

/**
 * CSS applying a theme to `scope`: the whole page (`:root`) or one subtree,
 * e.g. `[data-collection="heritage"]`. Follows the same theme selection as
 * src/styles/theme.css: light, dark with the system setting, overridden by any
 * data-theme attribute. `theme` must come from parseCollectionTheme.
 */
export function collectionThemeCss(theme: CollectionTheme, scope = ':root'): string {
  const light = { ...theme.skin, ...theme.light };
  if (scope === ':root') {
    return [
      rule(':root,[data-theme="light"]', light),
      `@media (prefers-color-scheme: dark){${rule(':root:not([data-theme="light"])', theme.dark)}}`,
      rule('[data-theme="dark"]', theme.dark),
    ].join('');
  }
  const forced = (mode: string) =>
    [`[data-theme="${mode}"] ${scope}`, `${scope}[data-theme="${mode}"]`, `${scope} [data-theme="${mode}"]`].join(',');
  return [
    rule(scope, light),
    // :where() keeps the system rule as weak as `scope`, so a forced data-theme wins.
    `@media (prefers-color-scheme: dark){${rule(`:where(:root:not([data-theme="light"])) ${scope}`, theme.dark)}}`,
    rule(forced('dark'), theme.dark),
    rule(forced('light'), theme.light),
  ].join('');
}
