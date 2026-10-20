CREATE TYPE "public"."achievement_kind" AS ENUM('distinct_cards', 'packs_opened', 'rarity_owned', 'series_completed');--> statement-breakpoint
CREATE TYPE "public"."coin_reason" AS ENUM('resale', 'achievement');--> statement-breakpoint
CREATE TYPE "public"."pack_origin" AS ENUM('free', 'subscription', 'bonus', 'purchase');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "achievements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"code" text NOT NULL,
	"kind" "achievement_kind" NOT NULL,
	"threshold" integer NOT NULL,
	"rarity" "rarity",
	"reward_coins" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_ledger" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coin_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" "coin_reason" NOT NULL,
	"reference" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_rules" (
	"collection_id" integer PRIMARY KEY NOT NULL,
	"cards_per_pack" integer DEFAULT 5 NOT NULL,
	"signup_packs" integer DEFAULT 10 NOT NULL,
	"refill_minutes" integer DEFAULT 10 NOT NULL,
	"max_reserve" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_cards" (
	"opening_id" integer NOT NULL,
	"position" integer NOT NULL,
	"card_id" integer NOT NULL,
	"is_new" boolean NOT NULL,
	"shiny" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pack_cards_opening_id_position_pk" PRIMARY KEY("opening_id","position")
);
--> statement-breakpoint
CREATE TABLE "pack_openings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pack_openings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"origin" "pack_origin" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_state" (
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"packs" integer NOT NULL,
	"last_refill" timestamp with time zone NOT NULL,
	CONSTRAINT "pack_state_user_id_collection_id_pk" PRIMARY KEY("user_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "rarity_odds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rarity_odds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"rarity" "rarity" NOT NULL,
	"per_million" integer NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resale_values" (
	"collection_id" integer NOT NULL,
	"rarity" "rarity" NOT NULL,
	"coins" integer NOT NULL,
	CONSTRAINT "resale_values_collection_id_rarity_pk" PRIMARY KEY("collection_id","rarity")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" uuid NOT NULL,
	"achievement_id" integer NOT NULL,
	"obtained_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "user_cards" (
	"user_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"first_obtained_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_cards_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
DROP INDEX "cards_visible_rarity_idx";--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rules" ADD CONSTRAINT "game_rules_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_cards" ADD CONSTRAINT "pack_cards_opening_id_pack_openings_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."pack_openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_cards" ADD CONSTRAINT "pack_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_openings" ADD CONSTRAINT "pack_openings_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_state" ADD CONSTRAINT "pack_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_state" ADD CONSTRAINT "pack_state_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rarity_odds" ADD CONSTRAINT "rarity_odds_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resale_values" ADD CONSTRAINT "resale_values_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_collection_code_key" ON "achievements" USING btree ("collection_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_ledger_user_reason_reference_key" ON "coin_ledger" USING btree ("user_id","reason","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_openings_user_key" ON "pack_openings" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "pack_openings_user_created_at_idx" ON "pack_openings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rarity_odds_collection_valid_from_key" ON "rarity_odds" USING btree ("collection_id","valid_from","rarity");--> statement-breakpoint
CREATE INDEX "user_cards_collection_user_idx" ON "user_cards" USING btree ("collection_id","user_id");--> statement-breakpoint
CREATE INDEX "cards_visible_rarity_idx" ON "cards" USING btree ("collection_id","rarity","id") WHERE "cards"."hidden_reason" IS NULL;