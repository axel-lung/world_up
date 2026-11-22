ALTER TABLE "cards" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "location_precision" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_location_complete" CHECK (("cards"."latitude" IS NULL) = ("cards"."longitude" IS NULL) AND ("cards"."latitude" IS NOT NULL OR "cards"."location_precision" IS NULL));--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_location_range" CHECK ("cards"."latitude" BETWEEN -90 AND 90 AND "cards"."longitude" BETWEEN -180 AND 180 AND "cards"."location_precision" >= 0);