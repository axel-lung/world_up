import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectionThemeCss, parseCollectionTheme, themeEmblem } from './collection-theme';

const theme = parseCollectionTheme({
  dark: { '--color-accent': '#f6a06b' },
  light: { '--color-accent': '#c67139' },
  skin: { '--skin-color': '#c67139', '--skin-ink': '#201e1d' },
});

describe('parseCollectionTheme', () => {
  it('accepts the theme set for the launch collection', () => {
    const sql = readFileSync('drizzle/0009_design_v2_theme.sql', 'utf8');
    const json = /'(\{[\s\S]*\})'::jsonb/.exec(sql)?.[1];
    const seeded = parseCollectionTheme(JSON.parse(json ?? 'null'));
    expect(seeded.light['--color-accent']).toBe('#c67139');
    expect(seeded.skin['--skin-color']).toBe('#c67139');
    expect(seeded.emblem).toBe('landmark');
  });

  it('gives a theme without an emblem the default one', () => {
    expect(theme.emblem).toBe('landmark');
  });

  it.each([
    ['a base token in a theme', { dark: { '--color-bg': '#000' } }],
    ['a non-skin variable in skin', { skin: { '--color-accent': '#000' } }],
    ['a declaration break', { dark: { '--color-accent': '#000; background: red' } }],
    ['a closing style tag', { skin: { '--skin-color': '</style><script>' } }],
    ['a remote resource', { skin: { '--skin-color': 'url(https://example.com/x.png)' } }],
    ['a comment', { skin: { '--skin-color': '#000 /* x' } }],
    ['a non-string value', { skin: { '--skin-size': 500 } }],
    ['an unknown emblem', { emblem: 'rocket' }],
    ['an unknown group', { dark: {}, extra: {} }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseCollectionTheme(input)).toThrow();
  });
});

describe('themeEmblem', () => {
  it('reads the emblem of a stored theme, the default one otherwise', () => {
    expect(themeEmblem({ emblem: 'castle' })).toBe('castle');
    expect(themeEmblem({ emblem: 'rocket' })).toBe('landmark');
    expect(themeEmblem(null)).toBe('landmark');
  });
});

describe('collectionThemeCss', () => {
  it('themes the page, light unless the system setting or data-theme asks for dark', () => {
    expect(collectionThemeCss(theme)).toBe(
      ':root,[data-theme="light"]{--skin-color:#c67139;--skin-ink:#201e1d;--color-accent:#c67139}' +
        '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--color-accent:#f6a06b}}' +
        '[data-theme="dark"]{--color-accent:#f6a06b}',
    );
  });

  it('can scope a theme to one subtree', () => {
    const css = collectionThemeCss(theme, '[data-collection="heritage"]');
    expect(css).toContain('[data-collection="heritage"]{--skin-color:#c67139');
    expect(css).toContain(':where(:root:not([data-theme="light"])) [data-collection="heritage"]{--color-accent:#f6a06b}');
    expect(css).toContain('[data-collection="heritage"] [data-theme="light"]{--color-accent:#c67139}');
  });
});
