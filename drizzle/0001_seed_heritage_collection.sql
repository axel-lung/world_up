-- The launch collection and its "Panneau touristique" skin (direction 1a,
-- design/Design system World Up.dc.html). The back-office edits it afterwards;
-- src/lib/collection-theme.ts validates the theme shape.
INSERT INTO "collections" ("slug", "name", "theme", "active")
VALUES (
  'heritage',
  'Patrimoine de France',
  '{
    "dark": {
      "--color-accent": "#d9a273",
      "--color-accent-strong": "#ebc6a4",
      "--color-accent-300": "#ebc6a4",
      "--color-accent-tint": "#4a3221",
      "--color-accent-800": "#4a3221",
      "--color-accent-100": "#f7ebe0",
      "--color-on-accent": "#161826"
    },
    "light": {
      "--color-accent": "#8a5a34",
      "--color-accent-strong": "#6e4526",
      "--color-accent-300": "#6e4526",
      "--color-accent-tint": "#efe0d0",
      "--color-accent-800": "#efe0d0",
      "--color-accent-100": "#4a2d17",
      "--color-on-accent": "#f6efe7"
    },
    "skin": {
      "--skin-fill": "#5a3820",
      "--skin-fill-ink": "#efe3d4",
      "--skin-card-bg": "#5a3820",
      "--skin-card-border": "1px solid #3b2414",
      "--skin-card-shadow": "inset 0 0 0 3px #5a3820, inset 0 0 0 4.5px #efe3d4",
      "--skin-card-ink": "#f6efe7",
      "--skin-card-muted": "#e2cdb9",
      "--skin-card-line": "rgba(239, 227, 212, 0.45)",
      "--skin-name-font": "var(--font-overpass), var(--font-body)",
      "--skin-name-weight": "500",
      "--skin-name-scale": "0.96",
      "--skin-name-tracking": "0",
      "--skin-display-font": "var(--font-overpass), var(--font-body)",
      "--skin-photo-bg": "#2a1a0e"
    }
  }'::jsonb,
  true
)
ON CONFLICT ("slug") DO NOTHING;
