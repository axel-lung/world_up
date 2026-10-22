-- Default trade and auction rules of the launch collection, editable in the
-- back-office (/admin/rules). The column defaults hold the rules themselves.
INSERT INTO "market_rules" ("collection_id")
SELECT "id" FROM "collections" WHERE "slug" = 'heritage'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Auction prices: from the quick resale value of the rarity to 100 times it
INSERT INTO "market_prices" ("collection_id", "rarity", "min_price", "max_price")
SELECT c."id", v."rarity"::"rarity", v."min_price", v."min_price" * 100
FROM "collections" c,
  (VALUES ('legendary', 200), ('ultra', 50), ('super', 15), ('rare', 5), ('uncommon', 2), ('common', 1)) AS v ("rarity", "min_price")
WHERE c."slug" = 'heritage'
ON CONFLICT DO NOTHING;
