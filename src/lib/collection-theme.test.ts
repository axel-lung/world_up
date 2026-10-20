import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectionThemeCss, parseCollectionTheme } from './collection-theme';

const theme = parseCollectionTheme({
  dark: { '--color-accent': '#d9a273' },
  light: { '--color-accent': '#8a5a34' },
  skin: { '--skin-card-bg': '#5a3820', '--skin-name-font': 'var(--font-overpass), var(--font-body)' },
});

describe('parseCollectionTheme', () => {
  it('accepts the theme seeded for the launch collection', () => {
    const sql = readFileSync('drizzle/0001_seed_heritage_collection.sql', 'utf8');
    const json = /'(\{[\s\S]*\})'::jsonb/.exec(sql)?.[1];
    const seeded = parseCollectionTheme(JSON.parse(json ?? 'null'));
    expect(seeded.dark['--color-accent']).toBe('#d9a273');
    expect(Object.keys(seeded.skin)).toContain('--skin-card-bg');
  });

  it.each([
    ['a base token in a theme', { dark: { '--color-bg': '#000' } }],
    ['a non-skin variable in skin', { skin: { '--color-accent': '#000' } }],
    ['a declaration break', { dark: { '--color-accent': '#000; background: red' } }],
    ['a closing style tag', { skin: { '--skin-fill': '</style><script>' } }],
    ['a remote resource', { skin: { '--skin-fill': 'url(https://example.com/x.png)' } }],
    ['a comment', { skin: { '--skin-fill': '#000 /* x' } }],
    ['a non-string value', { skin: { '--skin-name-weight': 500 } }],
    ['an unknown group', { dark: {}, extra: {} }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseCollectionTheme(input)).toThrow();
  });
});

describe('collectionThemeCss', () => {
  it('themes the page, following the system setting unless data-theme forces one', () => {
    expect(collectionThemeCss(theme)).toBe(
      ':root,[data-theme="dark"]{--skin-card-bg:#5a3820;--skin-name-font:var(--font-overpass), var(--font-body);--color-accent:#d9a273}' +
        '@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--color-accent:#8a5a34}}' +
        '[data-theme="light"]{--color-accent:#8a5a34}',
    );
  });

  it('can scope a theme to one subtree', () => {
    const css = collectionThemeCss(theme, '[data-collection="heritage"]');
    expect(css).toContain('[data-collection="heritage"]{--skin-card-bg:#5a3820');
    expect(css).toContain(':where(:root:not([data-theme="dark"])) [data-collection="heritage"]{--color-accent:#8a5a34}');
    expect(css).toContain('[data-collection="heritage"] [data-theme="dark"]{--color-accent:#d9a273}');
  });
});
