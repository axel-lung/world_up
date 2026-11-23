-- The achievement kinds of the visits. The type is made again rather than
-- extended: a value added by ALTER TYPE ... ADD VALUE can't be used before its
-- transaction commits, and Drizzle runs the pending migrations in one
-- transaction, the seed of 0023 included.
ALTER TYPE "public"."achievement_kind" RENAME TO "achievement_kind_old";--> statement-breakpoint
CREATE TYPE "public"."achievement_kind" AS ENUM('distinct_cards', 'packs_opened', 'rarity_owned', 'series_completed', 'monuments_visited', 'departments_visited', 'visits_in_a_day', 'rarities_visited', 'overseas_visited');--> statement-breakpoint
ALTER TABLE "achievements" ALTER COLUMN "kind" SET DATA TYPE "public"."achievement_kind" USING "kind"::text::"public"."achievement_kind";--> statement-breakpoint
DROP TYPE "public"."achievement_kind_old";--> statement-breakpoint
CREATE TABLE "card_visits" (
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"visited_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_visits_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "visit_radius_metres" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "visit_max_accuracy_metres" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "visits_per_day" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_visits" ADD CONSTRAINT "card_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_visits" ADD CONSTRAINT "card_visits_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_visits" ADD CONSTRAINT "card_visits_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_visits_user_visited_at_idx" ON "card_visits" USING btree ("user_id","visited_at");