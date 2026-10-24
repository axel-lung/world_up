ALTER TYPE "public"."coin_reason" ADD VALUE 'pack_opening';--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "coins_per_opening" integer DEFAULT 5 NOT NULL;