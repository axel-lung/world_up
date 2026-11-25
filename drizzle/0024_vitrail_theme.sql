-- The launch collection in the "vitrail" redesign (decided on 2026-11-25,
-- Claude Design project 57936f5d-de5d-4211-aee8-9def1a24e9c9): one dark
-- theme of stone and stained glass, so the light accent is the dark one. The
-- copper accent, its light shade for running text on the stone, the ink on its
-- fills, and the pack and emblem in copper. src/lib/collection-theme.ts
-- validates the theme shape.
UPDATE "collections"
SET "theme" = '{
  "light": {
    "--color-accent": "#c8743c",
    "--color-accent-strong": "#f6b877",
    "--color-accent-tint": "#4a301e",
    "--color-accent-100": "#4a301e",
    "--color-accent-400": "#f6b877",
    "--color-accent-600": "#e0954f",
    "--color-accent-700": "#a65a2a",
    "--color-accent-800": "#f6b877",
    "--color-on-accent": "#0c0c0e"
  },
  "dark": {
    "--color-accent": "#c8743c",
    "--color-accent-strong": "#f6b877",
    "--color-accent-tint": "#4a301e",
    "--color-accent-100": "#4a301e",
    "--color-accent-400": "#f6b877",
    "--color-accent-600": "#e0954f",
    "--color-accent-700": "#a65a2a",
    "--color-accent-800": "#f6b877",
    "--color-on-accent": "#0c0c0e"
  },
  "skin": {
    "--skin-color": "#c8743c",
    "--skin-ink": "#0c0c0e"
  },
  "emblem": "landmark"
}'::jsonb
WHERE "slug" = 'heritage';
