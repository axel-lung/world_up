-- The daily streak's milestones for the launch collection (decided on
-- 2026-11-21, from MobileB.dc.html): one bonus pack at each, editable at
-- /admin/rules.
INSERT INTO "streak_rewards" ("collection_id", "days", "packs")
SELECT c."id", v."days", 1
FROM "collections" c,
  (VALUES (3), (7), (14), (30), (50), (100), (200), (365), (500), (1000)) AS v ("days")
WHERE c."slug" = 'heritage'
ON CONFLICT DO NOTHING;
