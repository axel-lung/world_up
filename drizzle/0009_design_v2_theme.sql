-- The launch collection in the World Up v2 design system (Organic base,
-- design/Design system World Up v2.dc.html): the terracotta accent in each
-- theme, the pack and emblem color, and a monument as its emblem. The cards
-- themselves are cream and inked in every collection (src/styles/theme.css).
-- src/lib/collection-theme.ts validates the theme shape.
UPDATE "collections"
SET "theme" = '{
  "light": {
    "--color-accent": "#c67139",
    "--color-accent-strong": "#8c491a",
    "--color-accent-tint": "#ffe1d0",
    "--color-accent-100": "#fff2eb",
    "--color-accent-600": "#b2622d",
    "--color-accent-700": "#8c491a",
    "--color-accent-800": "#643312",
    "--color-on-accent": "#201e1d"
  },
  "dark": {
    "--color-accent": "#f6a06b",
    "--color-accent-strong": "#ffc6a5",
    "--color-accent-tint": "#643312",
    "--color-accent-100": "#643312",
    "--color-accent-600": "#ffc6a5",
    "--color-accent-700": "#ffe1d0",
    "--color-accent-800": "#ffe1d0",
    "--color-on-accent": "#201e1d"
  },
  "skin": {
    "--skin-color": "#c67139",
    "--skin-ink": "#201e1d"
  },
  "emblem": "landmark"
}'::jsonb
WHERE "slug" = 'heritage';
