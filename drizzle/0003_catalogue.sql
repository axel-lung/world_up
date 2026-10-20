CREATE TYPE "public"."hidden_reason" AS ENUM('memorial', 'commercial', 'twentieth_century', 'photo', 'admin');--> statement-breakpoint
CREATE TYPE "public"."photo_problem" AS ENUM('missing', 'too_small', 'license', 'download');--> statement-breakpoint
CREATE TYPE "public"."protection" AS ENUM('classe', 'inscrit');--> statement-breakpoint
CREATE TYPE "public"."rarity" AS ENUM('legendary', 'ultra', 'super', 'rare', 'uncommon', 'common');--> statement-breakpoint
CREATE TYPE "public"."series_type" AS ENUM('region', 'family', 'unesco', 'endangered');--> statement-breakpoint
CREATE TABLE "card_series" (
	"card_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"position" integer NOT NULL,
	"number" integer,
	CONSTRAINT "card_series_card_id_series_id_pk" PRIMARY KEY("card_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"wikidata_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"rarity" "rarity" NOT NULL,
	"rank" integer NOT NULL,
	"protection" "protection",
	"unesco" boolean DEFAULT false NOT NULL,
	"endangered" boolean DEFAULT false NOT NULL,
	"family" text,
	"department_code" text,
	"department" text,
	"region" text,
	"excerpt" text,
	"article_title" text NOT NULL,
	"article_revision" integer,
	"photo_image" text,
	"photo_commons_file" text,
	"photo_width" integer,
	"photo_height" integer,
	"photo_author" text,
	"photo_license" text,
	"photo_license_url" text,
	"photo_locked" boolean DEFAULT false NOT NULL,
	"photo_problem" "photo_problem",
	"memorial" boolean DEFAULT false NOT NULL,
	"commercial" boolean DEFAULT false NOT NULL,
	"twentieth_century" boolean DEFAULT false NOT NULL,
	"hidden_reason" "hidden_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "series_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"slug" text NOT NULL,
	"type" "series_type" NOT NULL,
	"name" text NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_series" ADD CONSTRAINT "card_series_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_series" ADD CONSTRAINT "card_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_series_series_position_idx" ON "card_series" USING btree ("series_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_collection_wikidata_key" ON "cards" USING btree ("collection_id","wikidata_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_collection_slug_key" ON "cards" USING btree ("collection_id","slug");--> statement-breakpoint
CREATE INDEX "cards_visible_rarity_idx" ON "cards" USING btree ("collection_id","rarity") WHERE "cards"."hidden_reason" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "series_collection_slug_key" ON "series" USING btree ("collection_id","slug");