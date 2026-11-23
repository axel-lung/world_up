-- The achievements of the on-site visits (Claude Design, "Carte - Tampon
-- profil acces", 7a), after the 20 of 0008. Editable like the others; the
-- visit rules themselves are game_rules columns, with their defaults.
INSERT INTO "achievements" ("collection_id", "code", "kind", "threshold", "rarity", "reward_coins", "position")
SELECT c."id", v."code", v."kind"::"achievement_kind", v."threshold", NULL, v."reward", v."position"
FROM "collections" c,
  (VALUES
    ('visits-1', 'monuments_visited', 1, 20, 21),
    ('visits-10', 'monuments_visited', 10, 100, 22),
    ('visits-50', 'monuments_visited', 50, 300, 23),
    ('visits-100', 'monuments_visited', 100, 600, 24),
    ('visit-departments-10', 'departments_visited', 10, 150, 25),
    ('visit-departments-30', 'departments_visited', 30, 400, 26),
    ('visit-day-5', 'visits_in_a_day', 5, 100, 27),
    ('visit-rarities-6', 'rarities_visited', 6, 300, 28),
    ('visit-overseas-1', 'overseas_visited', 1, 200, 29)
  ) AS v ("code", "kind", "threshold", "reward", "position")
WHERE c."slug" = 'heritage'
ON CONFLICT DO NOTHING;
