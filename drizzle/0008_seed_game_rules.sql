-- Default game rules of the launch collection, all editable afterwards: pack
-- rules and resale values in the back-office (/admin/rules), odds as a new
-- dated set, never an update.
INSERT INTO "game_rules" ("collection_id", "cards_per_pack", "signup_packs", "refill_minutes", "max_reserve")
SELECT "id", 5, 10, 10, 10 FROM "collections" WHERE "slug" = 'heritage'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Coins for one resold duplicate
INSERT INTO "resale_values" ("collection_id", "rarity", "coins")
SELECT c."id", v."rarity"::"rarity", v."coins"
FROM "collections" c,
  (VALUES ('legendary', 200), ('ultra', 50), ('super', 15), ('rare', 5), ('uncommon', 2), ('common', 1)) AS v ("rarity", "coins")
WHERE c."slug" = 'heritage'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Launch odds: each rarity's share of the catalogue (scripts/build_cards.py)
INSERT INTO "rarity_odds" ("collection_id", "rarity", "per_million", "valid_from")
SELECT c."id", v."rarity"::"rarity", v."per_million", date_trunc('milliseconds', now())
FROM "collections" c,
  (VALUES ('legendary', 2500), ('ultra', 25000), ('super', 70000), ('rare', 200000), ('uncommon', 200000), ('common', 502500))
    AS v ("rarity", "per_million")
WHERE c."slug" = 'heritage'
  AND NOT EXISTS (SELECT 1 FROM "rarity_odds" o WHERE o."collection_id" = c."id");
--> statement-breakpoint

INSERT INTO "achievements" ("collection_id", "code", "kind", "threshold", "rarity", "reward_coins", "position")
SELECT c."id", v."code", v."kind"::"achievement_kind", v."threshold", v."rarity"::"rarity", v."reward", v."position"
FROM "collections" c,
  (VALUES
    ('packs-1', 'packs_opened', 1, NULL, 5, 1),
    ('packs-10', 'packs_opened', 10, NULL, 20, 2),
    ('packs-50', 'packs_opened', 50, NULL, 50, 3),
    ('packs-100', 'packs_opened', 100, NULL, 100, 4),
    ('packs-500', 'packs_opened', 500, NULL, 300, 5),
    ('packs-1000', 'packs_opened', 1000, NULL, 500, 6),
    ('distinct-10', 'distinct_cards', 10, NULL, 10, 7),
    ('distinct-50', 'distinct_cards', 50, NULL, 25, 8),
    ('distinct-100', 'distinct_cards', 100, NULL, 50, 9),
    ('distinct-250', 'distinct_cards', 250, NULL, 100, 10),
    ('distinct-500', 'distinct_cards', 500, NULL, 200, 11),
    ('distinct-1000', 'distinct_cards', 1000, NULL, 400, 12),
    ('distinct-2500', 'distinct_cards', 2500, NULL, 800, 13),
    ('distinct-5000', 'distinct_cards', 5000, NULL, 1500, 14),
    ('distinct-10000', 'distinct_cards', 10000, NULL, 3000, 15),
    ('rarity-super', 'rarity_owned', 1, 'super', 20, 16),
    ('rarity-ultra', 'rarity_owned', 1, 'ultra', 50, 17),
    ('rarity-legendary', 'rarity_owned', 1, 'legendary', 200, 18),
    ('series-1', 'series_completed', 1, NULL, 500, 19),
    ('series-3', 'series_completed', 3, NULL, 1000, 20)
  ) AS v ("code", "kind", "threshold", "rarity", "reward", "position")
WHERE c."slug" = 'heritage'
ON CONFLICT DO NOTHING;
